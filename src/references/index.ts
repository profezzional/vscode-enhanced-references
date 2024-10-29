import * as vscode from "vscode";
import { SymbolsTree } from "../tree";
import {
  FileItem,
  ReferenceItem,
  ReferencesModel,
  ReferencesTreeInput,
} from "./model";

const PREFERRED_LOCATION_CONFIG: string =
  "enhanced-references.preferredLocation";

const registerShowReferencesCommand = (
  symbolsTree: SymbolsTree<FileItem | ReferenceItem>,
): vscode.Disposable => {
  const showReferencesDisposable: vscode.Disposable =
    vscode.commands.registerCommand(
      "editor.action.showReferences",
      async (
        uri: vscode.Uri,
        position: vscode.Position,
        locations: vscode.Location[],
      ): Promise<void> => {
        const input: ReferencesTreeInput = new ReferencesTreeInput(
          vscode.l10n.t("References"),
          new vscode.Location(uri, position),
          "vscode.executeReferenceProvider",
          locations,
        );

        symbolsTree.setInput(input);
      },
    );

  return showReferencesDisposable;
};

const handleShowReferencesCommandSubscription = (
  symbolsTree: SymbolsTree<FileItem | ReferenceItem>,
  context: vscode.ExtensionContext,
): void => {
  let showReferencesDisposable: vscode.Disposable | undefined;

  const updateShowReferences = (
    event: vscode.ConfigurationChangeEvent | undefined,
    showReferencesDisposable: vscode.Disposable | undefined,
  ): vscode.Disposable | undefined => {
    if (event && !event.affectsConfiguration(PREFERRED_LOCATION_CONFIG)) {
      return undefined;
    }

    const value: string | undefined = vscode.workspace
      .getConfiguration()
      .get<string>(PREFERRED_LOCATION_CONFIG);

    showReferencesDisposable?.dispose();
    showReferencesDisposable = undefined;

    if (value !== "view") {
      return undefined;
    }

    showReferencesDisposable = registerShowReferencesCommand(symbolsTree);

    return showReferencesDisposable;
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(
      (event: vscode.ConfigurationChangeEvent): void => {
        showReferencesDisposable =
          updateShowReferences(event, showReferencesDisposable) ||
          showReferencesDisposable;
      },
    ),
  );
  context.subscriptions.push({
    dispose: (): void => {
      showReferencesDisposable?.dispose();
    },
  });

  updateShowReferences(undefined, showReferencesDisposable);
};

export const registerCommands = (
  symbolsTree: SymbolsTree<FileItem | ReferenceItem>,
  context: vscode.ExtensionContext,
): void => {
  const findLocations = (title: string, command: string): void => {
    if (vscode.window.activeTextEditor) {
      const input: ReferencesTreeInput = new ReferencesTreeInput(
        title,
        new vscode.Location(
          vscode.window.activeTextEditor.document.uri,
          vscode.window.activeTextEditor.selection.active,
        ),
        command,
      );

      symbolsTree.setInput(input);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "enhanced-references.findReferences",
      (): void => {
        findLocations("References", "vscode.executeReferenceProvider");
      },
    ),
    vscode.commands.registerCommand(
      "enhanced-references.findImplementations",
      (): void => {
        findLocations(
          "Implementations",
          "vscode.executeImplementationProvider",
        );
      },
    ),
    vscode.commands.registerCommand(
      "enhanced-references.find",
      (...args: any[]): void => {
        vscode.commands.executeCommand(
          "enhanced-references.findReferences",
          ...args,
        );
      },
    ),
    vscode.commands.registerCommand(
      "enhanced-references.removeReferenceItem",
      (item: FileItem | ReferenceItem): void => {
        removeReferenceItem(item);
      },
    ),
    vscode.commands.registerCommand(
      "enhanced-references.copy",
      (item: ReferencesModel | ReferenceItem | FileItem): void => {
        copyCommand(item);
      },
    ),
    vscode.commands.registerCommand(
      "enhanced-references.copyAll",
      (item: ReferenceItem | FileItem): void => {
        copyAllCommand(item);
      },
    ),
    vscode.commands.registerCommand(
      "enhanced-references.copyPath",
      (item: FileItem): void => {
        copyPathCommand(item);
      },
    ),
  );

  handleShowReferencesCommandSubscription(symbolsTree, context);
};

const copyAllCommand = async (item: ReferenceItem | FileItem) => {
  if (item instanceof ReferenceItem) {
    copyCommand(item.file.model);
  } else if (item instanceof FileItem) {
    copyCommand(item.model);
  }
};

const removeReferenceItem = (item: FileItem | ReferenceItem): void => {
  if (item instanceof FileItem) {
    item.remove();
  } else if (item instanceof ReferenceItem) {
    item.remove();
  }
};

const copyCommand = async (
  item: ReferencesModel | ReferenceItem | FileItem,
): Promise<void> => {
  let itemValue: string | undefined;

  if (item instanceof ReferencesModel) {
    itemValue = await item.asCopyText();
  } else if (item instanceof ReferenceItem) {
    itemValue = await item.asCopyText();
  } else if (item instanceof FileItem) {
    itemValue = await item.asCopyText();
  }

  if (itemValue) {
    await vscode.env.clipboard.writeText(itemValue);
  }
};

const copyPathCommand = (item: FileItem): void => {
  if (!(item instanceof FileItem)) {
    return;
  }

  if (item.uri.scheme === "file") {
    vscode.env.clipboard.writeText(item.uri.fsPath);
  } else {
    vscode.env.clipboard.writeText(item.uri.toString(true));
  }
};
