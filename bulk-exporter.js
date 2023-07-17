(function() {
    const path = require('path');
    const fs = require('fs');

    const registeredButtons = [];
    const foldersCreated = [];

    var mudstackAccessToken = "";
    var mudstackAccountId = "";
    var mudstackWorkspaceId = "";

    var export_bulk;
    var export_folder;
    var export_as_gltf_folder;
    var upload_to_mudstack_as_gltf_folder;
    var login_in_to_mudstack_folder;

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

    async function sendKeyToMudstack(fileName, fileLocation, key) {
        try {
            const response = await fetch('https://api.mudstack.com/workspaces/assets/upload/assets', {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json",
                    "authorization": mudstackAccessToken,
                    "x-account-id": mudstackAccountId,
                    "x-workspace-id": mudstackWorkspaceId,
                },
                body: JSON.stringify({
                    "temp_file_key": key,
                    "original_file_name": fileName,
                    "file_location": fileLocation
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
                    "authorization": mudstackAccessToken,
                    "x-account-id": mudstackAccountId,
                    "x-workspace-id": mudstackWorkspaceId,
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
            const response = await fetch(signedUrl, {
                method: 'PUT',
                headers: {
                    "Content-Type": ""
                },
                body: file
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

    async function createFolderMudstack(folderName) {
        if (foldersCreated.includes(folderName)) {
            return { response: true, message: 'Folder already created.' };;
        }
        try {
            const response = await fetch(`https://api.mudstack.com/workspaces/folders?folder=${folderName}`, {
                headers: {
                    "authorization": mudstackAccessToken,
                    "x-account-id": mudstackAccountId,
                    "x-workspace-id": mudstackWorkspaceId,
                },
                method: "POST"
            });
            
            if (response.ok) {
                foldersCreated.push(folderName);
                return { response: await response.json() }; 
            } else {
                return { response: false, message: response.statusText, error: response.status };
            }
        } catch (error) {
            return { response: false, error: error }
        }
    }

    async function createFolderStructureMudstack(folder) {
        const folders = folder.split('/');
        let currentFolder = "";
        for (const folderPath of folders) {
            currentFolder += "/" + folderPath;
            await createFolderMudstack(currentFolder);
        }
    }

    async function uploadToMudstack(fileName, fileLocation, file) {
        const mudstackResponse = await getSignedUrlFromMudstack(fileName);
        if (mudstackResponse.error) {
            console.error(mudstackResponse.error); 
            return;
        }
        const uploadResponse = await uploadFileToSignedUrl(file, mudstackResponse.signed_url);
        if (uploadResponse.response) {
            const mudstackUploadResponse = await sendKeyToMudstack(fileName, fileLocation, mudstackResponse.key);
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

    function extractJsonObject(str) {
        let count = 0;
        let startIndex = str.indexOf('{');
        if (startIndex === -1) {
          return null;
        }
      
        for (let i = startIndex; i < str.length; i++) {
          if (str[i] === '{') {
            count++;
          } else if (str[i] === '}') {
            count--;
          }
      
          if (count === 0) {
            const jsonString = str.substring(startIndex, i + 1);
            try {
              const jsonObject = JSON.parse(jsonString);
              return jsonObject;
            } catch (error) {
              startIndex = str.indexOf('{', i);
              if (startIndex === -1) {
                break;
              }
              count = 0;
              i = startIndex - 1;
            }
          }
        }
      
        return null;
    }

    function createUploadPathForFile(file, folder, prefix = "") 
    {
        const fileName = path.parse(file.path).name;
        let mainPath = file.path.substring(file.path.indexOf(path.basename(folder)), file.path.indexOf(file.name));
        if (path.basename(mainPath) !== fileName) {
            mainPath = path.join(mainPath, fileName);
        }
        return (prefix + mainPath).replace(/\\/g, "/");
    }

    async function getMudstackUploadOptions() {
        return await new Promise((resolve, reject) => {
            let form = {
                rootFolder: { type: "text", label: "Root Folder", value: "/PZ/", description: "Choose folder to upload to."}
            };
            var dialog = new Dialog('mudstack_upload_options', {
                title: 'Mudstack Upload Options',
                width: 480,
                form,
                onConfirm(formResult) {
                    const rootFolder = formResult.rootFolder;
                    if (!rootFolder.startsWith('/') && !rootFolder.endsWith('/')) {
                        Blockbench.showMessageBox({ title: "Root Folder malformed", message: "Make sure the root folder starts and ends with '/'"})
                        return false;
                    }
                    resolve(formResult);
                },
                onCancel() {
                    resolve(null);
                }
            })
            dialog.show();
        });
    }

    async function handleLogInToMudstack() {
        await new Promise((resolve, reject) => {
            let form = {
                token: { type: "text", label: "Access Token"},
                accountId: { type: "text", label: "Account ID"},
                workspaceId: { type: "text", label: "Workspace ID"}
            };
            var dialog = new Dialog('mudstack_credentials', {
                title: 'Mudstack Credentials',
                width: 480,
                form,
                buttons: [
                    'Open mudstack',
                    'Paste from Clipboard',
                    'dialog.confirm', 'dialog.cancel'
                ],
                onCancel() {
                    resolve(null)
                },
                onButton(buttonId) {
                    if (buttonId === 0) {
                        Blockbench.openLink('https://app.mudstack.com/');
                        return false;
                    } else if (buttonId === 1) {
                        const clipboardText = clipboard.readText();
                        const jsonObject = extractJsonObject(clipboardText);
                        if (jsonObject) {
                            if (jsonObject.headers?.authorization && jsonObject["headers"]["x-account-id"] && jsonObject["headers"]["x-workspace-id"]) {
                                const authorizationToken = jsonObject.headers.authorization;
                                const _accountId = jsonObject["headers"]["x-account-id"];
                                const _workspaceId = jsonObject["headers"]["x-workspace-id"];
                                dialog.setFormValues({
                                    token: authorizationToken,
                                    accountId: _accountId,
                                    workspaceId: _workspaceId
                                });
                            } else {
                                Blockbench.showMessageBox({ title: "Unacceptable Request.", width: 480, message: "This request is not acceptable. Make sure to log in to your mudstack account, press [CTRL+Shift+I] to open the dev tools from Chrome, and navigate to the Network Tab. Click on [Fetch/XHR] on the filter options and leave it here. On the mudstack website, go to the workspace you want to upload. Back on the dev tools, you should see a list of request, search for one called [recent]. Right click it, go to Copy > Copy as fetch. You can now close this message and click [Copy from Clipboard] again."});
                            }
                        } else {
                            Blockbench.showMessageBox({ title: "Fetch not found.", width: 480, message: "The fetch command was not found. Make sure to log in to your mudstack account, press [CTRL+Shift+I] to open the dev tools from Chrome, and navigate to the Network Tab. Click on [Fetch/XHR] on the filter options and leave it here. On the mudstack website, go to the workspace you want to upload. Back on the dev tools, you should see a list of request, search for one called [recent]. Right click it, go to Copy > Copy as fetch. You can now close this message and click [Copy from Clipboard] again."});
                        }
                        return false;
                    } else if (buttonId === 2) {
                        const formResults = dialog.getFormResult();
                        if (formResults.token.length > 0 && formResults.accountId.length > 0 && formResults.workspaceId.length > 0)
                        {
                            fetch('https://api.mudstack.com/workspaces/folders/stats?folder=/', {
                                headers: {
                                    "Authorization": formResults.token,
                                    "X-Account-Id": formResults.accountId,
                                    "X-Workspace-Id": formResults.workspaceId
                                }
                            }).then(result => {
                                if (result.ok) {
                                    dialog.close();
                                    Blockbench.showQuickMessage("Authenticated!");
                                    mudstackAccessToken = formResults.token;
                                    mudstackAccountId = formResults.accountId;
                                    mudstackWorkspaceId = formResults.workspaceId;
                                    resolve(true);
                                } else {
                                    Blockbench.showMessageBox({ title: "Bad Request", width: 480, message: "Please refresh the mudstack page and copy another request again."});
                                    dialog.setFormValues({
                                        token: "",
                                        accountId: "",
                                        workspaceId: ""
                                    });
                                    clipboard.writeText('');
                                }
                            }).catch(err => {
                                console.error(err);
                            })
                            return false;
                        }
                    }
                }
            });
            dialog.show();
        })
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

    async function handleUploadFolderToMudstack() {
        const mudstackUploadOptions = await getMudstackUploadOptions();
        if (mudstackUploadOptions) {
            const startpath = findStartPath();
            const folder = selectFolder('project', startpath, 'Select Project Folder to Export');
            const files = findFiles(folder);
            for (const file of files)
            {
                const convertedModel = {...await loadModelFileAndConvert(file, Codecs.gltf),
                    uploadPath: createUploadPathForFile(file, folder, mudstackUploadOptions.rootFolder)
                };
                var messageBox = new MessageBox({ title: "Uploading Files", buttons: [], message: "Files are being uploaded, please wait."}, () => {}).show();
                await createFolderStructureMudstack(convertedModel.uploadPath);
                await uploadToMudstack(convertedModel.name, `${convertedModel.uploadPath}/`, convertedModel.content);
                await uploadToMudstack(file.name, `${convertedModel.uploadPath}/`, file.content);
                messageBox.close();
            }
            Blockbench.showQuickMessage("Models uploaded!");
        }
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
        version: '2.1.1',
        variant: 'both',
        onload() {
            login_in_to_mudstack_folder = registerButton(new Action('login_in_to_mudstack_folder', {
                name: 'Log in to mudstack',
                description: 'Log in to mudstack website.',
                icon: 'share',
                condition() { return !mudstackAccessToken; },
                click: handleLogInToMudstack
            }))
            upload_to_mudstack_as_gltf_folder = registerButton(new Action('upload_to_mudstack_as_gltf_folder', {
                name: 'Upload to mudstack as glTF',
                description: 'Upload all files to mudstack as glTF.',
                icon: 'share',
                condition() { return mudstackAccessToken; },
                click: handleUploadFolderToMudstack
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
            export_folder = registerButton(new Action('bulk_export_folder', {
                name: 'Export from folder...',
                description: 'Bulk export multiple .bbmodel files inside of a folder.',
                icon: 'fas.fa-file-import',
                children: [
                    export_as_gltf_folder,
                    login_in_to_mudstack_folder,
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
                ]
            }));
            MenuBar.addAction(export_bulk, 'file.4');
        },
        onunload() {
            deleteAllButtons();
        }
    });

})();