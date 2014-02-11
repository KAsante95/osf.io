# -*- coding: utf-8 -*-
import logging
import httplib as http
import datetime

import framework
from framework import Q, request, redirect
from framework.exceptions import HTTPError
from framework.forms import utils
from framework.routing import proxy_url
from framework.auth import get_current_user
from framework.auth.decorators import must_be_logged_in, Auth
from framework.auth.forms import (RegistrationForm, SignInForm,
                                  ForgotPasswordForm, ResetPasswordForm)

from website.models import Guid, Node, MetaData
from website.project.forms import NewProjectForm
from website.project import model
from website import settings

logger = logging.getLogger(__name__)


def _rescale_ratio(nodes):
    """Get scaling denominator for log lists across a sequence of nodes.

    :param nodes: Nodes
    :return: Max number of logs

    """
    if not nodes:
        return 0
    user = get_current_user()
    counts = [
        len(node.logs)
        for node in nodes
        if node.can_view(Auth(user=user))
    ]
    if counts:
        return float(max(counts))
    return 0.0


def _render_node(node):
    """

    :param node:
    :return:
    """
    return {
        'id': node._primary_key,
        'url': node.url,
        'api_url': node.api_url
    }



def _render_nodes(nodes):
    """

    :param nodes:
    :return:
    """
    ret = {
        'nodes': [
            _render_node(node)
            for node in nodes
        ],
        'rescale_ratio': _rescale_ratio(nodes),
    }
    return ret


def _get_user_activity(node, user, rescale_ratio):

    # Counters
    total_count = len(node.logs)

    # Note: It's typically much faster to find logs of a given node
    # attached to a given user using node.logs.find(...) than by
    # loading the logs into Python and checking each one. However,
    # using deep caching might be even faster down the road.

    ua_count = node.logs.find(Q('user', 'eq', user)).count()
    non_ua_count = total_count - ua_count # base length of blue bar

    # Normalize over all nodes
    ua = ua_count / rescale_ratio * settings.USER_ACTIVITY_MAX_WIDTH
    non_ua = non_ua_count / rescale_ratio * settings.USER_ACTIVITY_MAX_WIDTH

    return ua_count, ua, non_ua


@must_be_logged_in
def get_dashboard_nodes(**kwargs):
    user = kwargs['auth'].user
    nodes = user.node__contributed.find(
        Q('category', 'eq', 'project') &
        Q('is_deleted', 'eq', False) &
        Q('is_registration', 'eq', False)
    )
    return _render_nodes(nodes)


@must_be_logged_in
def dashboard(**kwargs):
    return {}

@must_be_logged_in
def watched_logs_get(**kwargs):
    user = kwargs['auth'].user
    recent_log_ids = list(user.get_recent_log_ids())
    logs = [model.NodeLog.load(id) for id in recent_log_ids]
    return {
        "logs": [log.serialize() for log in logs]
    }


def reproducibility():
    return framework.redirect('/EZcUj/wiki')


def registration_form():
    return utils.jsonify(RegistrationForm(prefix='register'))


def signin_form():
    return utils.jsonify(SignInForm())


def forgot_password_form():
    return utils.jsonify(ForgotPasswordForm(prefix='forgot_password'))


def reset_password_form():
    return utils.jsonify(ResetPasswordForm())


def new_project_form():
    return utils.jsonify(NewProjectForm())


### GUID ###

def _build_guid_url(url, prefix=None, suffix=None):
    if not url.startswith('/'):
        url = '/' + url
    if not url.endswith('/'):
        url += '/'
    url = (
        (prefix or '') +
        url +
        (suffix or '')
    )
    if not url.endswith('/'):
        url += '/'
    return url

def resolve_guid(guid, suffix=None):
    """Resolve GUID to corresponding URL and return result of appropriate
    view function. This effectively yields a redirect without changing the
    displayed URL of the page.

    :param guid: GUID value (not the object)
    :param suffix: String to append to GUID route
    :return: Werkzeug response

    """
    # Get prefix; handles API routes
    prefix = request.path.split(guid)[0].rstrip('/')

    # Look up GUID
    guid_object = Guid.load(guid)
    if guid_object:
        referent = guid_object.referent
        if referent is None:
            logger.error('Referent of GUID {0} not found'.format(guid))
            raise HTTPError(http.NOT_FOUND)
        mode = referent.redirect_mode
        url = referent.deep_url if mode == 'proxy' else referent.url
        url = _build_guid_url(url, prefix, suffix)
        # Always redirect API URLs; URL should identify endpoint being called
        if prefix or mode == 'redirect':
            return redirect(url)
        return proxy_url(url)

    # GUID not found; try lower-cased and redirect if exists
    guid_object_lower = Guid.load(guid.lower())
    if guid_object_lower:
        return redirect(
            _build_guid_url(
                guid.lower(), prefix, suffix
            )
        )

    # GUID not found
    raise HTTPError(http.NOT_FOUND)

### Meta-data ###

def node_comment_schema():
    return {'schema': Node.comment_schema['schema']}

# todo: check whether user can view comments
def get_comments_guid(guid, collection=None):
    guid_obj = Guid.load(guid)
    annotations = guid_obj.referent.annotations
    return {'comments': [
        {
            'payload': annotation.payload,
            'user_fullname': annotation.user.fullname,
            'date': annotation.date.strftime('%Y/%m/%d %I:%M %p'),
            'comment_id': annotation._primary_key,
        }
        for annotation in annotations
        if annotation.category == 'comment'
    ]}

# todo: check whether user can post comments
def add_comment_guid(guid, collection=None):
    guid_obj = Guid.load(guid)
    user = get_current_user()
    comment = MetaData(
        target=guid_obj.referent,
        category='comment',
        schema='osf_comment',
        payload={
            'comment': request.form.get('comment'),
            'rating': request.form.get('rating'),
        },
        user=user,
        date=datetime.datetime.utcnow(),
    )
    comment.save()
