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
    terminal?: vscode.Terminal;
}

const globalConfig: Config = {
    cols: [],
    hosts: [],
};

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
            const config = getConfigFromFile();
            if (!config || config.hosts.length === 0) {
                return;
            }

            await connectHosts(config.hosts, config.cols);
        }),
        vscode.commands.registerCommand("mlssh.connectSelected", async () => {
            const config = getConfigFromFile();
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

        vscode.commands.registerCommand("mlssh.sendCmdToAll", async () => {
            sendCmdsToTerminals({ selectFile: false, selectTerminals: false });
        }),

        vscode.commands.registerCommand("mlssh.sendCmdToSelected", async () => {
            sendCmdsToTerminals({ selectFile: false, selectTerminals: true });
        }),

        vscode.commands.registerCommand(
            "mlssh.sendCmdsInFileToAll",
            async () => {
                sendCmdsToTerminals({
                    selectFile: true,
                    selectTerminals: false,
                });
            }
        ),

        vscode.commands.registerCommand(
            "mlssh.sendCmdsInFileToSelected",
            async () => {
                sendCmdsToTerminals({
                    selectFile: true,
                    selectTerminals: true,
                });
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

function getConfigFromFile(configFilePath?: string): Config | undefined {
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
            const errors = checkHosts(configFile.hosts);
            if (errors.length > 0) {
                // vscode.window.showErrorMessage("errors in hosts", {
                //     modal: true,
                //     detail: errors.join("\n"),
                // });
                vscode.window.showErrorMessage(
                    "errors in hosts: " + errors.join(", ")
                );
                return;
            }

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

    const config = getConfigFromFile(path.join(rootPath, selectedConfig));
    if (!config || config.hosts.length === 0) {
        return;
    }
    return config;
}

function checkHosts(hosts: HostInfo[]): string[] {
    const errors: string[] = [];
    hosts.forEach((host) => {
        let name = host.name;
        if (host.name === undefined) {
            name = "?";
            errors.push("no name for this host");
        }
        if (host.host === undefined) {
            errors.push(`no host for ${name}`);
        }
        if (host.username === undefined) {
            errors.push(`no username for ${name}`);
        }
        if (host.usekey !== true && host.password === undefined) {
            errors.push(`no password for ${name}`);
        }
    });

    return errors;
}

async function selectHosts(hosts: HostInfo[]): Promise<HostInfo[]> {
    const selectedHosts = await vscode.window.showQuickPick(
        hosts.map((i) => ({
            ...i,
            label: i.name,
            description: `${i.username}@${i.host}`,
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
    globalConfig.hosts = hosts;
    globalConfig.cols = cols;
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
        renameIfExists(host);
        await vscode.commands.executeCommand(
            "workbench.action.terminal.renameWithArg",
            { name: host.name }
        );
        host.terminal = vscode.window.activeTerminal;
    }
}

function renameIfExists(host: HostInfo): void {
    const names = vscode.window.terminals.map((i) => i.name);
    for (let cnt = 0; cnt < 100; cnt++) {
        if (!names.includes(host.name)) {
            break;
        }
        // s.match(/.-(\d)+$/)
        // ['t-1', '1', index: 0, input: 't-1', groups: undefined]
        const m = host.name.match(/-(\d)+$/);
        if (m) {
            const idx = parseInt(m[1]) + 1;
            host.name = `${host.name.slice(0, m.index)}-${idx}`;
        } else {
            host.name = `${host.name}-1`;
        }
    }
}

function runSsh(host: HostInfo): void {
    const t = host.terminal;
    if (!t) {
        return;
    }
    t.sendText(`echo ${host.name}`);

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

async function sendCmdsToTerminals(options: {
    selectTerminals: boolean;
    selectFile: boolean;
}): Promise<void> {
    const allTerminals = vscode.window.terminals;
    if (allTerminals.length === 0) {
        vscode.window.showWarningMessage("no terminal open");
        return;
    }

    let terminals = allTerminals;
    if (options.selectTerminals) {
        const selectedTerminals = await vscode.window.showQuickPick(
            terminals.map((i) => ({
                ...i,
                label: i.name,
            })),
            {
                canPickMany: true,
            }
        );
        if (!selectedTerminals) {
            // user quit
            return;
        }
        terminals = selectedTerminals;
    }

    let cmds: string[] = [];
    if (options.selectFile) {
        const cmd = await getCmdFromFile();
        if (cmd) {
            cmds = cmd.split("\n");
        }
    } else {
        const cmd = await getCmdFromUser();
        if (cmd) {
            cmds = [cmd];
        }
    }

    if (cmds.length === 0) {
        return;
    }

    terminals.forEach((t) => {
        sendCmdsWithDelay(t, cmds);
    });
}

async function getCmdFromUser(initCmd?: string): Promise<string | undefined> {
    if (!initCmd) {
        initCmd = "whoami;hostname;uptime;pwd;ls";
    }

    const cmd = await vscode.window.showInputBox({
        title: "command to run",
        value: initCmd,
        valueSelection: [0, initCmd.length],
    });
    return cmd;
}

async function getCmdFromFile(): Promise<string | undefined> {
    const file = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        title: "select a script",
    });
    if (!file || file.length === 0) {
        return;
    }
    const cmd = fs.readFileSync(file[0].fsPath).toString();
    return cmd;
}

function sendCmdsWithDelay(
    terminal: vscode.Terminal,
    cmds: string[],
    delayMs?: number
): void {
    const delayMs2 = delayMs ? delayMs : 300;

    cmds.forEach((cmd, idx) => {
        setTimeout(() => {
            terminal.sendText(cmd);
        }, delayMs2 * idx);
    });
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
