# Enhanced References

This VS Code extension is "forked" from the bundled [References View](https://github.com/microsoft/vscode/tree/main/extensions/enhanced-references) extension, to add new features and functionality to the References panel.

## Requirements

This extension is intended to replace the existing References View extension (since this one is a superset of features and since the shortcuts overlap), so to avoid conflicts, it will prompt you to disable one before activating this one.

## Features

This extension has all the features of the existing References View extension, as well as the following.

### Find Assignments

For large projects, some identifiers (variables, properties, parameters, etc.) may have a lot of references, so to track down logic, it can be helpful to be able to filter that list to just the places where the identifier gets assigned a value. This extension adds a filtering to the References sidebar to filter to just assignments, along with these commands:

| Command              | Default Keyboard Shortcut |
| -------------------- | ------------------------- |
| Find All References  | <kbd>Shift+Alt+F12</kbd>  |
| Find All Assignments | <kbd>Shift+Alt+F11</kbd>  |

## Upcoming/In-Progress Features

### Tree View

An option to the References sidebar to display the file list in a tree view instead of a list of files.

### File References

Right-click on the path of a file and find all references to that file (imports, configs, etc.). Same as [this extension](https://github.com/binyamin/vscode-backlinks-panel)

### References Count

Inside the text document, show how how many references an identifier has, like [this extension](https://github.com/Ky6uk/vscode-zero-reference/tree/master)

## Development

### Dependencies:

This repo uses:

- [pnpm](https://pnpm.io/) for package management
- [prettier](https://prettier.io/) for code formatting
- [typescript-eslint](https://typescript-eslint.io/) for code styling

### Debugging Locally

1. Open the repo in VS Code
1. Run `pnpm install` in a terminal
1. Start debugging

### Merging the latest version of the References View extension:

This will result in a lot of merge conflicts that will have to be manually sorted out, so depending how much has changed since the last merge, it may be easier to do a `diff` (using your difftool of choice) and manually apply the updates.

1.  Get an updated local copy of the VS Code repo and navigate to it in a terminal (or clone/pull the latest/whatever version of whatever branch you want from that repo):

    ```bash
    git clone https://github.com/microsoft/vscode.git
    cd vscode
    ```

1.  Filter that repo to the `references-view` extension folder:

    ```bash
    git filter-repo --path extensions/references-view/ --path-rename extensions/references-view/:
    ```

    This puts the contents of the `references-view` folder as the root of the `vscode` repo folder, so that it matches the folder structure of a standalone extension repo. Note: the trailing slashes on both args are required, and putting nothing after the colon in the `path-rename` arg tells it to move the contents to the root level of the current directory.

1.  This is the point where it may be easier to do a `diff` instead of actually trying to merge. You run the merge command either from the filtered VS Code repo or from this repo. To do it from the filtered VS Code repo:

    ```bash
    git remote add upstream <path to this repo root>
    git fetch upstream
    git merge upstream/main
    ```

#### Example

Locally, I usually have a `repos` folder that I put everything in, and my Windows path isn't set up right with Python, so I would do:

```bash
cd repos
git clone https://github.com/microsoft/vscode.git
cd vscode
python 'C:\Program Files\git\cmd\git-filter-repo' --path extensions/references-view/ --path-rename extensions/references-view/:
git remote add upstream ../vscode-enhanced-references
git fetch upstream
git merge upstream/main
```

## Issues/Contributing

Bug reports, feature suggestions/requests, and pull requests are welcome, though for any pull requests, please try to review the style of the existing code and try to match that. I may make updates to PRs or make new branches on top of PRs to help them match the styling (beyond just Prettier, to include naming, types specification, code layout, etc.), while still crediting the PR creator.
