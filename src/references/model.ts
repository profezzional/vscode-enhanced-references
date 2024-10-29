import * as vscode from "vscode";
import {
  SymbolItemDragAndDrop,
  SymbolItemEditorHighlights,
  SymbolItemNavigation,
  SymbolsTreeInput,
  SymbolsTreeModel,
} from "../enhanced-references";
import {
  asResourceUrl,
  compareLocations,
  compareUriIgnoreFragment,
  deleteFromArray,
  getLengthOfCommonPrefix,
  getPreviewChunks,
  Preview,
  tail,
} from "../utils";

export class ReferencesTreeInput
  implements SymbolsTreeInput<FileItem | ReferenceItem>
{
  public readonly contextValue: string;

  public constructor(
    public readonly title: string,
    public readonly location: vscode.Location,
    private readonly command: string,
    private readonly result?: vscode.Location[] | vscode.LocationLink[],
  ) {
    this.contextValue = command;
  }

  public async resolve(): Promise<
    SymbolsTreeModel<FileItem | ReferenceItem> | undefined
  > {
    let model: ReferencesModel;

    if (this.result) {
      model = new ReferencesModel(this.result);
    } else {
      const result: vscode.Location[] | vscode.LocationLink[] =
        await vscode.commands.executeCommand<
          vscode.Location[] | vscode.LocationLink[]
        >(this.command, this.location.uri, this.location.range.start);

      model = new ReferencesModel(result || []);
    }

    if (model.items.length === 0) {
      return;
    }

    const provider: ReferencesTreeDataProvider = new ReferencesTreeDataProvider(
      model,
    );

    return {
      provider,
      get message(): string {
        return model.message;
      },
      navigation: model,
      highlights: model,
      dragAndDrop: model,
      dispose(): void {
        provider.dispose();
      },
    };
  }

  public with(location: vscode.Location): ReferencesTreeInput {
    return new ReferencesTreeInput(this.title, location, this.command);
  }
}

export class ReferencesModel
  implements
    SymbolItemNavigation<FileItem | ReferenceItem>,
    SymbolItemEditorHighlights<FileItem | ReferenceItem>,
    SymbolItemDragAndDrop<FileItem | ReferenceItem>
{
  public readonly onDidChange: vscode.EventEmitter<
    FileItem | ReferenceItem | undefined
  > = new vscode.EventEmitter<FileItem | ReferenceItem | undefined>();

  public readonly items: FileItem[] = [];

  public constructor(locations: vscode.Location[] | vscode.LocationLink[]) {
    // TODO: pull this out into a function
    let lastItem: FileItem | undefined;

    for (const item of locations.sort(
      (
        location1: vscode.Location | vscode.LocationLink,
        location2: vscode.Location | vscode.LocationLink,
      ): number => {
        return compareLocations(location1, location2);
      },
    )) {
      const location: vscode.Location =
        item instanceof vscode.Location
          ? item
          : new vscode.Location(item.targetUri, item.targetRange);

      if (
        !lastItem ||
        compareUriIgnoreFragment(lastItem.uri, location.uri) !== 0
      ) {
        lastItem = new FileItem(location.uri.with({ fragment: "" }), [], this);
        this.items.push(lastItem);
      }

      lastItem.references.push(new ReferenceItem(location, lastItem));
    }
  }

  public get message(): string {
    if (this.items.length === 0) {
      return vscode.l10n.t("No results.");
    }

    const numTotalReferences = this.items.reduce(
      (runningTotal: number, currentItem: FileItem) => {
        return runningTotal + currentItem.references.length;
      },
      0,
    );
    const numFiles: number = this.items.length;

    return vscode.l10n.t(
      `${numTotalReferences} result${numTotalReferences === 1 ? "" : "s"} in ${numFiles} file${numFiles === 1 ? "" : "s"}`,
      numTotalReferences,
      numFiles,
    );
  }

  public location(item: FileItem | ReferenceItem): vscode.Location {
    const location: vscode.Location =
      item instanceof ReferenceItem
        ? item.location
        : new vscode.Location(
            item.uri,
            item.references[0]?.location.range ?? new vscode.Position(0, 0),
          );

    return location;
  }

  public nearest(
    uri: vscode.Uri,
    position: vscode.Position,
  ): FileItem | ReferenceItem | undefined {
    if (this.items.length === 0) {
      return;
    }

    // NOTE: this.items is sorted by location (uri/range)
    for (const item of this.items) {
      if (item.uri.toString() !== uri.toString()) {
        continue;
      }

      for (const reference of item.references) {
        const referenceIsAtRequestedPosition: boolean =
          reference.location.range.contains(position);

        if (referenceIsAtRequestedPosition) {
          return reference;
        }
      }

      // (2) pick the first item after or last before the request position
      let lastItemBeforeRequestedPosition: ReferenceItem | undefined;

      for (const ref of item.references) {
        const isFirstItemAfterRequestedPosition: boolean =
          ref.location.range.end.isAfter(position);

        if (isFirstItemAfterRequestedPosition) {
          return ref;
        }

        lastItemBeforeRequestedPosition = ref;
      }

      if (lastItemBeforeRequestedPosition) {
        return lastItemBeforeRequestedPosition;
      }

      break;
    }

    const indexOfFileWithLongestCommonPrefixWithURI: number =
      this.getIndexOfFileWithLongestCommonPrefixWithURI(uri);

    return this.items[indexOfFileWithLongestCommonPrefixWithURI].references[0];
  }

  private getIndexOfFileWithLongestCommonPrefixWithURI(
    uri: vscode.Uri,
  ): number {
    let longestCommonPrefixIndex: number = 0;

    const longestCommonPrefixLength: number = getLengthOfCommonPrefix(
      this.items[longestCommonPrefixIndex].toString(),
      uri.toString(),
    );

    for (let i: number = 1; i < this.items.length; i++) {
      const currentItemLongestCommonPrefixLength = getLengthOfCommonPrefix(
        this.items[i].uri.toString(),
        uri.toString(),
      );

      if (currentItemLongestCommonPrefixLength > longestCommonPrefixLength) {
        longestCommonPrefixIndex = i;
      }
    }

    return longestCommonPrefixIndex;
  }

  public next(item: FileItem | ReferenceItem): FileItem | ReferenceItem {
    const nextItem: FileItem | ReferenceItem = this.move(item, true) ?? item;

    return nextItem;
  }

  public previous(item: FileItem | ReferenceItem): FileItem | ReferenceItem {
    const previousItem: FileItem | ReferenceItem =
      this.move(item, false) ?? item;

    return previousItem;
  }

  private move(
    item: FileItem | ReferenceItem,
    forward: boolean,
  ): ReferenceItem | undefined {
    const delta: number = forward ? 1 : -1;

    const getNextOrPreviousItem = (item: FileItem): FileItem => {
      const nextOrPreviousOrWrapAroundIndex: number =
        (this.items.indexOf(item) + delta + this.items.length) %
        this.items.length;

      return this.items[nextOrPreviousOrWrapAroundIndex];
    };

    if (item instanceof FileItem) {
      const nextOrPreviousItem: FileItem = getNextOrPreviousItem(item);
      const nextOrPreviousItemReferences: ReferenceItem[] =
        nextOrPreviousItem.references;

      if (forward) {
        return nextOrPreviousItemReferences[0];
      } else {
        return tail(nextOrPreviousItemReferences);
      }
    }

    if (item instanceof ReferenceItem) {
      const destinationIndex: number =
        item.file.references.indexOf(item) + delta;
      const nextOrPreviousItem: FileItem = getNextOrPreviousItem(item.file);
      const nextOrPreviousItemReferences: ReferenceItem[] =
        nextOrPreviousItem.references;

      if (destinationIndex < 0) {
        return tail(nextOrPreviousItemReferences);
      } else if (destinationIndex >= item.file.references.length) {
        return nextOrPreviousItemReferences[0];
      } else {
        return item.file.references[destinationIndex];
      }
    }

    return undefined; // TODO: handle this case better
  }

  public getEditorHighlights(
    item: FileItem | ReferenceItem,
    uri: vscode.Uri,
  ): vscode.Range[] | undefined {
    const file: FileItem | undefined = this.items.find(
      (file: FileItem): boolean => {
        const isTargetFile: boolean = file.uri.toString() === uri.toString();

        return isTargetFile;
      },
    );

    const referenceRanges: vscode.Range[] | undefined = file?.references.map(
      (reference: ReferenceItem): vscode.Range => {
        return reference.location.range;
      },
    );

    return referenceRanges;
  }

  public remove(item: FileItem | ReferenceItem): void {
    if (item instanceof FileItem) {
      deleteFromArray(this.items, item);
      this.onDidChange.fire(undefined);

      return;
    }

    deleteFromArray(item.file.references, item);

    if (item.file.references.length === 0) {
      deleteFromArray(this.items, item.file);
      this.onDidChange.fire(undefined);

      return;
    }

    this.onDidChange.fire(item.file);
  }

  public async asCopyText(): Promise<string> {
    let result: string = "";

    for (const item of this.items) {
      const itemText: string = await item.asCopyText();

      result += `${itemText}\n`;
    }

    return result;
  }

  public getDragURI(item: FileItem | ReferenceItem): vscode.Uri | undefined {
    if (item instanceof FileItem) {
      return item.uri;
    }

    return asResourceUrl(item.file.uri, item.location.range);
  }
}

class ReferencesTreeDataProvider
  implements vscode.TreeDataProvider<FileItem | ReferenceItem>
{
  private readonly listener: vscode.Disposable;
  public readonly onDidChange = new vscode.EventEmitter<
    FileItem | ReferenceItem | undefined
  >();

  public constructor(private readonly model: ReferencesModel) {
    this.listener = model.onDidChange.event(() =>
      this.onDidChange.fire(undefined),
    );
  }

  public dispose(): void {
    this.onDidChange.dispose();
    this.listener.dispose();
  }

  public async getTreeItem(element: FileItem | ReferenceItem) {
    if (element instanceof FileItem) {
      const result: vscode.TreeItem = new vscode.TreeItem(element.uri);
      result.contextValue = "file-item";
      result.description = true;
      result.iconPath = vscode.ThemeIcon.File;
      result.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

      return result;
    }

    const { range } = element.location;
    const document: vscode.TextDocument = await element.getDocument(true);
    const { before, inside, after }: Preview = getPreviewChunks(
      document,
      range,
    );

    const label: vscode.TreeItemLabel = {
      label: before + inside + after,
      highlights: [[before.length, before.length + inside.length]],
    };

    const result: vscode.TreeItem = new vscode.TreeItem(label);
    result.collapsibleState = vscode.TreeItemCollapsibleState.None;
    result.contextValue = "reference-item";
    result.command = {
      command: "vscode.open",
      title: vscode.l10n.t("Open Reference"),
      arguments: [
        element.location.uri,
        {
          selection: range.with({ end: range.start }),
        } satisfies vscode.TextDocumentShowOptions,
      ],
    };

    return result;
  }

  public getChildren(
    element?: FileItem | ReferenceItem,
  ): FileItem[] | ReferenceItem[] | undefined {
    if (!element) {
      return this.model.items;
    }

    if (element instanceof FileItem) {
      return element.references;
    }

    return undefined;
  }

  public getParent(element: FileItem | ReferenceItem): FileItem | undefined {
    return element instanceof ReferenceItem ? element.file : undefined;
  }
}

export class FileItem {
  public constructor(
    public readonly uri: vscode.Uri,
    public readonly references: Array<ReferenceItem>,
    public readonly model: ReferencesModel,
  ) {}

  public remove(): void {
    this.model.remove(this);
  }

  public async asCopyText(): Promise<string> {
    let result: string = `${vscode.workspace.asRelativePath(this.uri)}\n`;

    for (const reference of this.references) {
      const referenceText: string = await reference.asCopyText();

      result += `  ${referenceText}\n`;
    }

    return result;
  }
}

export class ReferenceItem {
  private document: Thenable<vscode.TextDocument> | undefined;

  public constructor(
    public readonly location: vscode.Location,
    public readonly file: FileItem,
  ) {}

  public async getDocument(warmUpNext?: boolean): Promise<vscode.TextDocument> {
    if (!this.document) {
      this.document = vscode.workspace.openTextDocument(this.location.uri);
    }

    if (warmUpNext) {
      // load next document once this document has been loaded
      const nextItem: FileItem | ReferenceItem = this.file.model.next(
        this.file,
      );

      if (nextItem instanceof FileItem && nextItem !== this.file) {
        vscode.workspace.openTextDocument(nextItem.uri);
      } else if (nextItem instanceof ReferenceItem) {
        vscode.workspace.openTextDocument(nextItem.location.uri);
      }
    }

    return this.document;
  }

  public remove(): void {
    this.file.model.remove(this);
  }

  public async asCopyText(): Promise<string> {
    const document: vscode.TextDocument = await this.getDocument();
    const chunks: Preview = getPreviewChunks(
      document,
      this.location.range,
      21,
      false,
    );

    return `${this.location.range.start.line + 1}, ${this.location.range.start.character + 1}: ${chunks.before + chunks.inside + chunks.after}`;
  }
}
