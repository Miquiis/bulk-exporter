(function() {
    const path = require('path');
    const fs = require('fs');
    const registeredButtons = [];

    var mudstackAccessToken = "";
    var mudstackAccountId = "";
    var mudstackWorkspaceId = "";

    var export_files;
    var export_as_gltf;
    var export_bulk;
    var export_folder;
    var export_as_gltf_folder;
    var upload_to_mudstack_as_gltf_folder;
    var upload_to_mudstack_as_gltf_file;
    var login_in_to_mudstack;

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

    async function loadModelFileAndConvert(file, asCodec) {

        let extension = pathToExtension(file.path);
    
        async function loadIfCompatible(codec, type, content) {
            if (codec.load_filter && codec.load_filter.type == type) {
                if (codec.load_filter.extensions.includes(extension) && Condition(codec.load_filter.condition, content)) {
                    codec.load(content, file);
                    await asCodec.promptExportOptions();
                    const extension = asCodec.getExportOptions().encoding == 'binary' ? 'glb' : 'gltf';
                    let codecContent = await asCodec.compile();
                    await new Promise(r => setTimeout(r, 20));
                    Project.close();
                    const convertedModelName = path.parse(file.name).name;
                    return { name: `${convertedModelName}.${extension}`, content: codecContent};
                }
            }
        }
    
        // Text
        for (let id in Codecs) {
            let success = await loadIfCompatible(Codecs[id], 'image', file.content);
            if (success) return success;
        }
        // Text
        for (let id in Codecs) {
            let success = await loadIfCompatible(Codecs[id], 'text', file.content);
            if (success) return success;
        }
        // JSON
        let model = autoParseJSON(file.content);
        for (let id in Codecs) {
            let success = await loadIfCompatible(Codecs[id], 'json', model);
            if (success) return success;
        }
    }

    async function sendKeyToMudstack(fileName, key) {
        try {
            const response = await fetch('https://api.mudstack.com/workspaces/assets/upload/assets', {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json",
                    "authorization": `Bearer ${mudstackAccessToken}`,
                    "x-account-id": mudstackAccountId,
                    "x-workspace-id": mudstackWorkspaceId,
                },
                body: JSON.stringify({
                    "temp_file_key": key,
                    "original_file_name": fileName,
                    "file_location": "/Test Folder/"
                })
            });
            if (response.ok) {
                return response.json();
            } else {
                return { message: response.statusText, error: response.status }
            }
        } catch (error) {
            return { error: error };
        }
    }

    async function getSignedUrlFromMudstack(fileName) {
        try {
            const response = await fetch('https://api.mudstack.com/workspaces/assets/upload/', {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json",
                    "authorization": `Bearer ${mudstackAccessToken}`,
                    "x-account-id": "4b6a84b4-6b47-4af8-b7e6-0046e77c5953",
                    "x-workspace-id": "d70f8686-c2ea-4925-a25b-02a71aa2fecb",
                },
                body: JSON.stringify({
                    "name": fileName
                })
            });
    
            if (response.status === 200)
            {
                const responseJson = await response.json();
                return responseJson;
            } else {
                return {};
            }
        } catch (error) {
            return { error: error }
        }
    }

    async function uploadFileToSignedUrl(file, signedUrl) {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(signedUrl, {
                method: 'PUT',
                headers: {
                    "Content-Type": ""
                },
                body: formData
            });

            if (response.ok) {
                return { response: true }; 
            } else {
                return { response: false, message: response.statusText, error: response.status };
            }
        } catch (error) {
            console.log(error);
            return { response: false, error: error}
        }
    }

    async function uploadToMudstack(fileName, file) {
        const mudstackResponse = await getSignedUrlFromMudstack(fileName);
        if (mudstackResponse.error) {
            console.log(mudstackResponse.error); 
            return;
        }
        const uploadResponse = await uploadFileToSignedUrl(file, mudstackResponse.signed_url);
        if (uploadResponse.response) {
            const mudstackUploadResponse = await sendKeyToMudstack(fileName, mudstackResponse.key);
            if (!mudstackUploadResponse.error) {
                console.log(mudstackUploadResponse);
            } else {
                console.error(`Unable to send key back to MudStack. Status: ${mudstackUploadResponse.message}, Error: ${mudstackUploadResponse.error}`);
            }
        } else {
            console.error(`Unable to upload file to URL. Status: ${uploadResponse.message}, Error: ${uploadResponse.error}`);
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

    function findStartPath() {
        var startpath;
        if (isApp && recent_projects && recent_projects.length) {
            let first_recent_project = recent_projects.find(p => !p.favorite) || recent_projects[0];
            startpath = first_recent_project.path;
            if (typeof startpath == 'string') {
                startpath = startpath.replace(/[\\\/][^\\\/]+$/, '');
            }
        }
        return startpath;
    }

    async function handleLogInToMudstack() {
    }

    async function handleExportAsGltfFolder() {
        const startpath = findStartPath();
        const folder = selectFolder('project', startpath, 'Select Project Folder to Export')
        const files = findFiles(folder);
        for (const file of files)
        {
            await loadModelFileAndExport(file, path.dirname(file.path), Codecs.gltf);
        }
    }

    async function handleUploadToMudstackFolder() {
        const startpath = findStartPath();
        const folder = selectFolder('project', startpath, 'Select Project Folder to Export')
        const files = findFiles(folder);
        for (const file of files)
        {
            const convertedModel = await loadModelFileAndConvert(file, Codecs.gltf);
            await uploadToMudstack(convertedModel.name, convertedModel.content);
        }
    }

    async function handleUploadToMudstackFile() {
        const startpath = findStartPath();
        Blockbench.import({
            resource_id: 'model',
            extensions: ['bbmodel'],
            type: 'Model',
            startpath,
            multiple: true
        }, async function(files) {
            for (const file of files) {
                const convertedModel = await loadModelFileAndConvert(file, Codecs.gltf);
                await uploadToMudstack(convertedModel.name, convertedModel.content);
            }
        })
    }

    async function handleExportAsGltf() {
        const startpath = findStartPath();
        const folder = selectFolder('gltf', startpath, 'Select Export Folder')
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

    function registerButton(button) {
        registeredButtons.push(button);
        return button;
    }

    function deleteAllButtons() {
        registeredButtons.forEach(button => button.delete());
    }

    Plugin.register('bulk-exporter', {
        title: 'Bulk Exporter',
        author: 'Miquiis',
        description: 'This plugins allows you to bulk export Blockbench projects into other extentions.',
        icon: 'fas.fa-file-import',
        version: '1.1.1',
        variant: 'both',
        onload() {
            login_in_to_mudstack = registerButton(new Action('login_in_to_mudstack', {
                name: 'Log in to mudstack',
                description: 'Log in to mudstack website.',
                icon: 'share',
                click: handleLogInToMudstack
            }))
            upload_to_mudstack_as_gltf_folder = registerButton(new Action('upload_to_mudstack_as_gltf_folder', {
                name: 'Upload to mudstack as glTF',
                description: 'Upload all files to mudstack as glTF.',
                icon: 'share',
                click: handleUploadToMudstackFolder
            }))
            upload_to_mudstack_as_gltf_file = registerButton(new Action('upload_to_mudstack_as_gltf_file', {
                name: 'Upload to mudstack as glTF',
                description: 'Upload all files to mudstack as glTF.',
                icon: 'share',
                click: handleUploadToMudstackFile
            }))
            export_as_gltf = registerButton(new Action('export_as_gltf', {
                name: 'Export as glTF',
                description: 'Export all Blockbench projects into glTF.',
                icon: 'icon-gltf',
                click: handleExportAsGltf
            }))
            export_as_gltf_folder = registerButton(new Action('export_as_gltf_folder', {
                name: 'Export as glTF',
                description: 'Export all Blockbench projects inside given folder into glTF.',
                icon: 'icon-gltf',
                click: handleExportAsGltfFolder
            }))
            export_files = registerButton(new Action('bulk_export_files', {
                name: 'Export files...',
                description: 'Bulk export multiple .bbmodel files.',
                icon: 'fas.fa-file-import',
                children: [
                    export_as_gltf,
                    upload_to_mudstack_as_gltf_file
                ]
            }))
            export_folder = registerButton(new Action('bulk_export_folder', {
                name: 'Export from folder...',
                description: 'Bulk export multiple .bbmodel files inside of a folder.',
                icon: 'fas.fa-file-import',
                children: [
                    export_as_gltf_folder,
                    upload_to_mudstack_as_gltf_folder
                ]
            }))
            export_bulk = registerButton(new Action('bulk_export', {
                name: 'Bulk Export...',
                description: 'Bulk Export multiple Blockbench projects into a desired format.',
                icon: 'fas.fa-file-import',
                condition(){return !Project},
                children: [
                    export_folder,
                    export_files
                ]
            }));
            MenuBar.addAction(export_bulk, 'file.4');
            MenuBar.addAction(login_in_to_mudstack, 'file');
        },
        onunload() {
            deleteAllButtons();
        }
    });

})();