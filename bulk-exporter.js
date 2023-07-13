(function() {
    const path = require('path');
    const fs = require('fs');

    var export_files;
    var export_as_gltf;
    var export_bulk;
    var export_folder;
    var export_as_gltf_folder;

    async function loadModelFileAndExport(file, folder, asCodec) {

        let extension = pathToExtension(file.path);
    
        async function loadIfCompatible(codec, type, content) {
            if (codec.load_filter && codec.load_filter.type == type) {
                if (codec.load_filter.extensions.includes(extension) && Condition(codec.load_filter.condition, content)) {
                    codec.load(content, file);
                    await asCodec.promptExportOptions();
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

    function selectFolder(id, startpath, title) {
        return Blockbench.pickDirectory({
            resource_id: id,
            startpath: startpath,
            title: title
        });
    }

    function findFiles(folder, files = []) {
        fs.readdirSync(folder).forEach(fileName => {
            const filepath = path.resolve(folder, fileName);
            const stat = fs.statSync(filepath);
            const isFile = stat.isFile();
            if (isFile) {
                const ext = path.parse(fileName).ext;
                if (ext === '.bbmodel') {
                    const data = fs.readFileSync(filepath, 'utf-8');
                    files.push({
                        name: fileName,
                        path: filepath,
                        content: data
                    });
                }
            } else if (stat.isDirectory()) {
                return findFiles(filepath, files);
            }
        });
        return files;
    }

    function deleteAll(button) {
        if (button.children)
        {
            button.children.forEach(children => deleteAll(children));
        }
        button.delete();
    }

    Plugin.register('bulk-exporter', {
        title: 'Bulk Exporter',
        author: 'Miquiis',
        description: 'This plugins allows you to bulk export Blockbench projects into other extentions.',
        icon: 'fas.fa-file-import',
        version: '1.1.0',
        variant: 'both',
        onload() {
            export_as_gltf = new Action('export_as_gltf', {
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

                    var folder = selectFolder('gltf', startpath, 'Select Export Folder')
        
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
            export_as_gltf_folder = new Action('export_as_gltf_folder', {
                name: 'Export as glTF',
                description: 'Export all Blockbench projects inside given folder into glTF.',
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

                    var folder = selectFolder('project', startpath, 'Select Project Folder to Export')

                    const files = findFiles(folder);

                    for (const file of files)
                    {
                        await loadModelFileAndExport(file, path.dirname(file.path), Codecs.gltf);
                    }
                }
            })
            export_files = new Action('bulk_export_files', {
                name: 'Bulk Export Files...',
                description: 'Bulk Export multiple .bbmodel files into a desired format to a folder.',
                icon: 'fas.fa-file-import',
                condition(){return !Project},
                children: [
                    export_as_gltf
                ]
            })
            export_folder = new Action('bulk_export_folder', {
                name: 'Bulk Export Folder...',
                description: 'Bulk Export multiple .bbmodel files inside of a folder.',
                icon: 'fas.fa-file-import',
                condition(){return !Project},
                children: [
                    export_as_gltf_folder
                ]
            })
            export_bulk = new Action('bulk_export', {
                name: 'Bulk Export...',
                description: 'Bulk Export multiple Blockbench projects into a desired format.',
                icon: 'fas.fa-file-import',
                children: [
                    export_folder,
                    export_files
                ]
            });
            MenuBar.addAction(export_bulk, 'file.4');
        },
        onunload() {
            deleteAll(export_bulk);
        }
    });

})();