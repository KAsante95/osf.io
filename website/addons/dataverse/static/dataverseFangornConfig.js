'use strict';

var m = require('mithril');
var $ = require('jquery');
var Fangorn = require('fangorn');

function refreshDataverseTree(grid, item, state) {
    var data = item.data || {};
    var url = item.data.urls.state + '?' + $.param({state: state});
    data.state = state;
    $.ajax({
        type: 'get',
        url: url,
        success: function(data) {
            // Update the item with the new state data
            $.extend(item.data, data[0]);
            grid.updateFolder(null, item);
        }
    });
}

function _uploadUrl(item, file) {
    return item.data.urls.upload + '?' + $.param({name: file.name});
}

function _downloadEvent(event, item, col) {
    event.stopPropagation();
    console.log('Download Event triggered', this, event, item, col);
    window.location = item.data.urls.download;
}

// Define Fangorn Button Actions
function _fangornActionColumn (item, col) {
    var self = this;
    var buttons = [];

    function _uploadEvent (event, item, col){
        event.stopPropagation();
        this.dropzone.hiddenFileInput.click();
        this.dropzoneItemCache = item;
        console.log('Upload Event triggered', this, event,  item, col);
    }

    function dataverseRelease(event, item, col) {
        var self = this; // treebeard
        var url = item.data.urls.release;
        var modalContent = [
            m('h3', 'Release this study?'),
            m('p.m-md', 'By releasing this study, all content will be made available through the Harvard Dataverse using their internal privacy settings, regardless of your OSF project settings.'),
            m('p.font-thick.m-md', 'Are you sure you want to release this study?')
        ];
        var modalActions = [
            m('button.btn.btn-default.m-sm', { 'onclick' : function (){ self.modal.dismiss(); }},'Cancel'),
            m('button.btn.btn-primary.m-sm', { 'onclick' : function() { releaseStudy(); } }, 'Release Study')
        ];

        this.modal.update(modalContent, modalActions);

        function releaseStudy() {
            self.modal.dismiss();
            item.notify.update('Releasing Study', 'info', 1, 3000);
            $.osf.putJSON(
                url,
                {}
            ).done(function(data) {
                var modalContent = [
                    m('p.m-md', 'Your study has been released. Please allow up to 24 hours for the released version to appear on your OSF project\'s file page.')
                ];
                var modalActions = [
                    m('button.btn.btn-primary.m-sm', { 'onclick' : function() { self.modal.dismiss(); } }, 'Okay')
                ];
                self.modal.update(modalContent, modalActions);
            }).fail( function(args) {
                console.log('Returned error:', args);
                var message = args.responseJSON.code === 400 ?
                    'Error: Something went wrong when attempting to release your study.' :
                    'Error: This version has already been released.';

                var modalContent = [
                    m('p.m-md', message)
                ];
                var modalActions = [
                    m('button.btn.btn-primary.m-sm', { 'onclick' : function() { self.modal.dismiss(); } }, 'Okay')
                ];
                self.modal.update(modalContent, modalActions);
                //self.updateItem(row);
            });
        }
    }

    function _removeEvent (event, item, col) {
        event.stopPropagation();
        console.log('Remove Event triggered', this, event, item, col);
        var tb = this;
        if (item.data.permissions.edit) {
            // delete from server, if successful delete from view
            $.ajax({
              url: item.data.urls.delete,
              type : 'DELETE'
            })
            .done(function(data) {
                // delete view
                tb.deleteNode(item.parentID, item.id);
                console.log('Delete success: ', data);
            })
            .fail(function(data){
                console.log('Delete failed: ', data);
            });
        }
    }

    // Download Zip File
    if (item.kind === 'folder' && item.data.addonFullname && item.data.permissions.edit) {
        buttons.push({
            'name' : '',
            'tooltip' : 'Upload file',
            'icon' : 'icon-upload-alt',
            'css' : 'fangorn-clickable btn btn-default btn-xs',
            'onclick' : _uploadEvent
        });
        if (item.data.state === 'draft') {
            buttons.push({
                'name' : ' Release Study',
                'tooltip' : '',
                'icon' : 'icon-globe',
                'css' : 'btn btn-primary btn-xs',
                'onclick' : dataverseRelease
            });
        }
    } else if (item.kind === 'folder' && !item.data.addonFullname) {
        buttons.push(
            {
                'name' : '',
                'tooltip' : 'Upload file',
                'icon' : 'icon-upload-alt',
                'css' : 'fangorn-clickable btn btn-default btn-xs',
                'onclick' : _uploadEvent
            }
        );
    } else if (item.kind === 'file') {
        if (item.data.state === 'released' || item.data.permissions.edit) {
            buttons.push({
                name : '',
                'tooltip' : 'Download file',
                icon : 'icon-download-alt',
                css : 'btn btn-info btn-xs',
                onclick: _downloadEvent
            });
        }
        if (item.data.state === 'draft' || item.data.permissions.edit) {
            buttons.push({
                'name' : '',
                'tooltip' : 'Delete',
                'icon' : 'icon-remove',
                'css' : 'm-l-lg text-danger fg-hover-hide',
                'style' : 'display:none',
                'onclick' : _removeEvent
            });
        }
    }
    return m('.btn-group', [
            buttons.map(function(btn){
                return m('i', { 'data-col' : item.id, 'class' : btn.css, 'data-toggle' : 'tooltip', title : btn.tooltip, 'data-placement': 'bottom',  style : btn.style, 'onclick' : function(){ btn.onclick.call(self, event, item, col); } },
                    [ m('span', { 'class' : btn.icon}, btn.name) ]);
            })
    ]);
}

function _fangornDataverseTitle(item, col) {
    var tb = this;
    if (item.data.addonFullname) {
        var contents = [m('dataverse-name', item.data.name + ' ')];
        if (item.data.hasReleasedFiles) {
            if (item.data.permissions.edit) {
                var options = [
                    m('option', {selected: item.data.state === 'draft', value: 'draft'}, 'Draft'),
                    m('option', {selected: item.data.state === 'released', value: 'released'}, 'Released')
                ];
                contents.push(
                    m('span', [
                        m('select', {
                            class: 'dataverse-state-select',
                            onchange: function(e) {
                                refreshDataverseTree(tb, item, e.target.value);
                            },
                        }, options)
                    ])
                );
            } else {
                contents.push(
                    m('span', '[Released]')
                );
            }
        }
        return m('span', contents);
    } else {
        return m('span',[
            m('dataverse-name', {
                onclick: function() {
                    console.log(item);
                    window.location = item.data.urls.view;
                }}, item.data.name
             )
        ]);
    }
}

function _fangornColumns(item) {
    var columns = [];
    columns.push({
        data : 'name',
        folderIcons : true,
        filter : true,
        custom: _fangornDataverseTitle,
    });

    if (this.options.placement === 'project-files') {
        columns.push(
            {
                css : 'action-col',
                filter: false,
                custom : _fangornActionColumn
            },
            {
                data  : 'downloads',
                filter : false,
                css : ''
            }
        );
    }

    return columns;
}

function _fangornFolderIcons(item){
    if(item.data.iconUrl){
        return m('img',{src:item.data.iconUrl, style:{width:'16px', height:'auto'}}, ' ');
    }
    return undefined;
}

function _fangornLazyLoad(item) {
    return item.data.urls.fetch;
}

Fangorn.config.dataverse = {
    // Handle changing the branch select
    folderIcon: _fangornFolderIcons,
    resolveRows: _fangornColumns,
    lazyload:_fangornLazyLoad,
    uploadUrl: _uploadUrl
};
