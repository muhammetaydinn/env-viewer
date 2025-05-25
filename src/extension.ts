import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      "envEditor.editor",
      new EnvEditorProvider(context),
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );
}

class EnvEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    function updateWebview() {
      const text = document.getText();
      const envVars = parseEnvFile(text);
      webviewPanel.webview.postMessage({
        type: "update",
        envVars: envVars,
      });
    }

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() === document.uri.toString()) {
          updateWebview();
        }
      }
    );

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });

    webviewPanel.webview.onDidReceiveMessage((e) => {
      switch (e.type) {
        case "save":
          this.updateTextDocument(document, e.envVars);
          return;
      }
    });

    updateWebview();
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Env Editor</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
        }
        .env-item {
            display: flex;
            margin-bottom: 10px;
            align-items: center;
            gap: 10px;
        }
        input {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 5px;
            min-width: 150px;
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 5px 10px;
            cursor: pointer;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .add-button {
            margin-top: 20px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .delete-button {
            background-color: var(--vscode-errorForeground);
            color: white;
        }
    </style>
</head>
<body>
    <h2>Environment Variables Editor</h2>
    <div id="env-container"></div>
    <button class="add-button" onclick="addEnvVar()">Add Variable</button>
    
    <script>
        const vscode = acquireVsCodeApi();
        let envVars = [];

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'update') {
                envVars = message.envVars;
                renderEnvVars();
            }
        });

        function renderEnvVars() {
            const container = document.getElementById('env-container');
            container.innerHTML = '';
            
            envVars.forEach((envVar, index) => {
                const div = document.createElement('div');
                div.className = 'env-item';
                div.innerHTML = \`
                    <input type="text" placeholder="Key" value="\${envVar.key}" 
                           onchange="updateEnvVar(\${index}, 'key', this.value)">
                    <span>=</span>
                    <input type="text" placeholder="Value" value="\${envVar.value}" 
                           onchange="updateEnvVar(\${index}, 'value', this.value)">
                    <button class="delete-button" onclick="deleteEnvVar(\${index})">Delete</button>
                \`;
                container.appendChild(div);
            });
        }

        function updateEnvVar(index, field, value) {
            envVars[index][field] = value;
            saveChanges();
        }

        function addEnvVar() {
            envVars.push({ key: '', value: '' });
            renderEnvVars();
        }

        function deleteEnvVar(index) {
            envVars.splice(index, 1);
            renderEnvVars();
            saveChanges();
        }

        function saveChanges() {
            vscode.postMessage({
                type: 'save',
                envVars: envVars
            });
        }
    </script>
</body>
</html>`;
  }

  private updateTextDocument(document: vscode.TextDocument, envVars: any[]) {
    const edit = new vscode.WorkspaceEdit();
    const envContent = envVars
      .filter((env) => env.key.trim() !== "")
      .map((env) => `${env.key}=${env.value}`)
      .join("\n");

    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      envContent
    );

    return vscode.workspace.applyEdit(edit);
  }
}

function parseEnvFile(content: string): { key: string; value: string }[] {
  const lines = content.split("\n");
  const envVars: { key: string; value: string }[] = [];

  lines.forEach((line) => {
    line = line.trim();
    if (line && !line.startsWith("#")) {
      const equalIndex = line.indexOf("=");
      if (equalIndex > 0) {
        const key = line.substring(0, equalIndex).trim();
        const value = line.substring(equalIndex + 1).trim();
        envVars.push({ key, value });
      }
    }
  });

  return envVars;
}

export function deactivate() {}
