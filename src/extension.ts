// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

interface Config {
    cols: number[];
    hosts: HostInfo[];
}

interface HostInfo {
    name: string;
    host: string;
    username: string;
    password?: string;
    usekey?: boolean;
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    // console.log('Congratulations, your extension "mlssh" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    context.subscriptions.push(
        vscode.commands.registerCommand("mlssh.connectAll", async () => {
            // The code you place here will be executed every time your command is executed
            const config = getHosts();
            if (!config || config.hosts.length === 0) {
                return;
            }

            await connectHosts(config.hosts, config.cols);
        }),
        vscode.commands.registerCommand("mlssh.connectSelected", async () => {
            const config = getHosts();
            if (!config || config.hosts.length === 0) {
                return;
            }

            const selectedHosts = await selectHosts(config.hosts);
            if (selectHosts.length === 0) {
                return;
            }

            await connectHosts(selectedHosts, config.cols);
        }),
        vscode.commands.registerCommand(
            "mlssh.selectConfigConnectAll",
            async () => {
                const config = await selectConfig();
                if (!config || config?.hosts.length === 0) {
                    return;
                }

                await connectHosts(config.hosts, config.cols);
            }
        ),
        vscode.commands.registerCommand(
            "mlssh.selectConfigConnectSelected",
            async () => {
                const config = await selectConfig();
                if (!config || config.hosts.length === 0) {
                    return;
                }

                const selectedHosts = await selectHosts(config.hosts);
                if (selectHosts.length === 0) {
                    return;
                }

                await connectHosts(selectedHosts, config.cols);
            }
        ),

        vscode.commands.registerCommand("mlssh.createConfig", async () => {
            await createConfig();
        })
    );
}

function getRootPath(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    // console.log(folders);
    if (!folders) {
        vscode.window.showErrorMessage(
            `no folder is selected for this vscode workspace. please select a work folder first.`
        );
        return;
    }
    if (folders && folders.length > 0) {
        // console.log(folders);
        const folder = folders[0];
        return folder.uri.fsPath;
    }
}

const defaultHostFile = "mlssh.json";
async function createConfig(configFilePath?: string): Promise<void> {
    if (!configFilePath) {
        const folder = getRootPath();
        if (!folder) {
            return;
        }
        configFilePath = path.join(folder, defaultHostFile);
    }

    if (fs.existsSync(configFilePath)) {
        vscode.window.showErrorMessage(
            `config file ${configFilePath} already exists, please rename it.`
        );
        return;
    }

    const config: Config = {
        cols: [1, 2],
        hosts: [
            {
                name: "host1",
                host: "host1",
                username: "ml",
                password: "pass",
            },
            {
                name: "host2",
                host: "192.168.1.2",
                username: "ml",
                usekey: true,
            },
            {
                name: "host3",
                host: "host3",
                username: "ml",
                password: "pass",
            },
            {
                name: "host4",
                host: "host4",
                username: "ml",
                password: "pass",
            },
        ],
    };
    try {
        fs.writeFileSync(configFilePath, JSON.stringify(config, undefined, 4));
        const document = await vscode.workspace.openTextDocument(
            configFilePath
        );
        showDocument(document);
    } catch (error) {
        vscode.window.showErrorMessage("failed to create config file");
    }
}

function showDocument(document: vscode.TextDocument): void {
    const viewColumn: vscode.ViewColumn =
        vscode.window.activeTextEditor &&
        vscode.window.activeTextEditor.viewColumn
            ? vscode.window.activeTextEditor.viewColumn
            : vscode.ViewColumn.One;

    vscode.window.showTextDocument(document, viewColumn, false);
}

function getHosts(configFilePath?: string): Config | undefined {
    if (!configFilePath) {
        const folder = getRootPath();
        if (!folder) {
            return;
        }
        configFilePath = path.join(folder, defaultHostFile);
    }

    if (!fs.existsSync(configFilePath)) {
        vscode.window.showErrorMessage(`file not exists: ${configFilePath}`);
        return;
    }

    const data = fs.readFileSync(configFilePath).toString();
    try {
        const configFile: Partial<Config> = JSON.parse(data);
        if (
            typeof configFile === "object" &&
            configFile.cols !== undefined &&
            configFile.hosts !== undefined
        ) {
            const config: Config = {
                cols: [3],
                hosts: [],
                ...configFile,
            };
            return config;
        } else {
            vscode.window.showErrorMessage(
                "no required props in config file: cols, hosts"
            );
        }
    } catch (error) {
        vscode.window.showErrorMessage(
            "failed to parse config file. please check it."
        );
    }
}

async function selectConfig(): Promise<Config | undefined> {
    const rootPath = getRootPath();
    if (!rootPath) {
        return;
    }

    const files = fs.readdirSync(rootPath);
    const configs = files.filter((i) => i.endsWith(".json"));
    if (configs.length === 0) {
        vscode.window.showErrorMessage("no config file found");
        return;
    }

    const selectedConfig = await vscode.window.showQuickPick(configs, {
        canPickMany: false,
    });
    // console.log("user selected", selectedConfig);
    if (!selectedConfig) {
        return;
    }

    const config = getHosts(path.join(rootPath, selectedConfig));
    if (!config || config.hosts.length === 0) {
        return;
    }
    return config;
}

async function selectHosts(hosts: HostInfo[]): Promise<HostInfo[]> {
    const selectedHosts = await vscode.window.showQuickPick(
        hosts.map((i) => ({
            ...i,
            label: i.name,
            description: i.host,
        })),
        {
            canPickMany: true,
        }
    );
    // console.log("user selected", selectedHosts);
    if (!selectedHosts) {
        return [];
    }
    return selectedHosts;
}

async function connectHosts(hosts: HostInfo[], cols: number[]): Promise<void> {
    // console.log("hosts", hosts);
    await createTerminalsByRows(hosts, cols);
    // console.log("create terminals all done");
    hosts.forEach((host) => {
        runSsh(host);
    });
}

async function createTerminalsByRows(
    hosts: HostInfo[],
    cols: number[]
): Promise<void> {
    let offset = 0;
    const rows: HostInfo[][] = [];
    for (let idx = 0; idx < cols.length; idx++) {
        if (offset >= hosts.length) {
            break;
        }
        const col = cols[idx];
        const row = hosts.slice(offset, offset + col);
        rows.push(row);
        offset += col;
    }
    if (offset < hosts.length) {
        rows.push(hosts.slice(offset));
    }
    // console.log("rows", rows);

    for (let idx = 0; idx < rows.length - 1; idx++) {
        await vscode.commands.executeCommand(
            "workbench.action.splitEditorOrthogonal"
        );
    }
    await vscode.commands.executeCommand(
        "workbench.action.focusFirstEditorGroup"
    );

    for (let idx = 0; idx < rows.length; idx++) {
        const row = rows[idx];
        await createTerminalsOneRow(row, row.length);
        await vscode.commands.executeCommand(
            "workbench.action.focusBelowGroup"
        );
    }
}

async function createTerminalsOneRow(
    hosts: HostInfo[],
    cols: number
): Promise<void> {
    for (let tIdx = 0; tIdx < hosts.length; tIdx++) {
        let createCmd = "workbench.action.createTerminalEditorSide";
        // TODO: remain terminals created should place next the last one
        // if (tIdx === 0 || tIdx >= cols) {
        //     createCmd = "workbench.action.createTerminalEditor";
        // }
        if (tIdx === 0) {
            createCmd = "workbench.action.createTerminalEditor";
        }

        await vscode.commands.executeCommand(createCmd);
        const host = hosts[tIdx];
        await vscode.commands.executeCommand(
            "workbench.action.terminal.renameWithArg",
            { name: host.name }
        );
    }
}

function runSsh(host: HostInfo): void {
    const ts = vscode.window.terminals;
    const t = ts.find((j) => j.name === host.name);
    if (!t) {
        return;
    }
    t.sendText(`echo ${host.name}`);
    if (host.host === undefined) {
        t.sendText(`echo no host`);
        vscode.window.showErrorMessage(`no host for ${host.name}`);
        return;
    }
    if (host.username === undefined) {
        t.sendText(`echo no username`);
        vscode.window.showErrorMessage(`no username for ${host.name}`);
        return;
    }
    if (host.usekey !== true && host.password === undefined) {
        t.sendText(`echo no password`);
        vscode.window.showErrorMessage(`no password for ${host.name}`);
        return;
    }

    let sshCmd: string;
    const sshExtraOpts =
        "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR";
    if (host.usekey) {
        sshCmd = `ssh ${sshExtraOpts} ${host.username}@${host.host}`;
    } else {
        sshCmd = `sshpass -p '${host.password}' ssh ${sshExtraOpts} ${host.username}@${host.host}`;
        // sshCmd = `ssh ${host.username}@${host.host} hostname`;
    }
    t.sendText(sshCmd);
}

// vscode.commands.getCommands(true).then((cmds) => {
//     const workbench = cmds.filter(
//         (i) =>
//             i.startsWith("workbench.action") &&
//             i.toLowerCase().includes("terminal")
//     );
//     console.log(workbench);
// });

// this method is called when your extension is deactivated
export function deactivate() {}
