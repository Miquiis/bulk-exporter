(function() {
    var button;

    async function loadModelFileAndExport(file, folder, asCodec) {

        let extension = pathToExtension(file.path);
    
        async function loadIfCompatible(codec, type, content) {
            if (codec.load_filter && codec.load_filter.type == type) {
                if (codec.load_filter.extensions.includes(extension) && Condition(codec.load_filter.condition, content)) {
                    codec.load(content, file);
                    let codecContent = await asCodec.compile();
                    await new Promise(r => setTimeout(r, 20));
                    const path = folder + `/${asCodec.fileName()}.gltf`;
                    asCodec.write(codecContent, path);
                    Project.close();
                    return true;
                }
            }
        }
    
        // Text
        for (let id in Codecs) {
            let success = await loadIfCompatible(Codecs[id], 'image', file.content);
            if (success) return;
        }
        // Text
        for (let id in Codecs) {
            let success = await loadIfCompatible(Codecs[id], 'text', file.content);
            if (success) return;
        }
        // JSON
        let model = autoParseJSON(file.content);
        for (let id in Codecs) {
            let success = await loadIfCompatible(Codecs[id], 'json', model);
            if (success) return;
        }
    }

    Plugin.register('bulk-exporter', {
        title: 'Bulk Exporter',
        author: 'Miquiis',
        description: 'This plugins allows you to bulk export Blockbench projects into other extentions.',
        icon: 'fas.fa-file-import',
        version: '0.0.1',
        variant: 'both',
        onload() {
            button = new Action('bulk_export', {
                name: 'Bulk Export',
                description: 'Bulk Export multiple Blockbench projects into a desired format.',
                icon: 'fas.fa-file-import',
                condition(){return !Project},
                children: [
                    new Action('export_as_gltf', {
                        name: 'Export as glTF',
                        description: 'Export all Blockbench projects into glTF.',
                        icon: 'icon-gltf',
                        click: async function() {
                            var startpath;
                            if (isApp && recent_projects && recent_projects.length) {
                                let first_recent_project = recent_projects.find(p => !p.favorite) || recent_projects[0];
                                startpath = first_recent_project.path;
                                if (typeof startpath == 'string') {
                                    startpath = startpath.replace(/[\\\/][^\\\/]+$/, '');
                                }
                            }
                
                            var folder = Blockbench.pickDirectory({
                                resource_id: 'gltf',
                                startpath: startpath,
                                title: 'Select Export Folder'
                            });
                
                            Blockbench.import({
                                resource_id: 'model',
                                extensions: ['bbmodel'],
                                type: 'Model',
                                startpath,
                                multiple: true
                            }, async function(files) {
                                for (const file of files) {
                                    await loadModelFileAndExport(file, folder, Codecs.gltf);
                                }
                            })
                        }
                    })
                ]
            });
            MenuBar.addAction(button, 'file.4');
        },
        onunload() {
            button.delete();
        }
    });

})();