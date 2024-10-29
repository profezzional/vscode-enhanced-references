import * as vscode from "vscode";
import { SymbolItemEditorHighlights } from "./enhanced-references";

export class EditorHighlights<T> {
  private readonly decorationType =
    vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor(
        "editor.findMatchHighlightBackground",
      ),
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      overviewRulerLane: vscode.OverviewRulerLane.Center,
      overviewRulerColor: new vscode.ThemeColor(
        "editor.findMatchHighlightBackground",
      ),
    });

  private readonly disposables: vscode.Disposable[] = [];
  private readonly ignore: Set<string> = new Set<string>();

  public constructor(
    private readonly view: vscode.TreeView<T>,
    private readonly delegate: SymbolItemEditorHighlights<T>,
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(
        (event: vscode.TextDocumentChangeEvent): void => {
          this.ignore.add(event.document.uri.toString());
        },
      ),
      vscode.window.onDidChangeActiveTextEditor((): void => {
        if (view.visible) {
          this.update();
        }
      }),
      view.onDidChangeVisibility(
        (event: vscode.TreeViewVisibilityChangeEvent): void => {
          if (event.visible) {
            this.show();
          } else {
            this.hide();
          }
        },
      ),
      view.onDidChangeSelection((): void => {
        if (view.visible) {
          this.update();
        }
      }),
    );
    this.show();
  }

  public dispose(): void {
    vscode.Disposable.from(...this.disposables).dispose();

    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this.decorationType, []);
    }
  }

  private show(): void {
    const { activeTextEditor: editor } = vscode.window;

    if (!editor || !editor.viewColumn) {
      return;
    }
    if (this.ignore.has(editor.document.uri.toString())) {
      return;
    }

    const [anchor] = this.view.selection;

    if (!anchor) {
      return;
    }

    const ranges: vscode.Range[] | undefined =
      this.delegate.getEditorHighlights(anchor, editor.document.uri);

    if (ranges) {
      editor.setDecorations(this.decorationType, ranges);
    }
  }

  private hide(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this.decorationType, []);
    }
  }

  public update(): void {
    this.hide();
    this.show();
  }
}
