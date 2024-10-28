# Enhanced References

## The Repository

This VS Code extension is "forked" from the bundled [References View](https://github.com/microsoft/vscode/tree/main/extensions/enhanced-references) extension, to add new features and functionality to the References panel.

## Requirements

This extension is intended to replace the existing References View extension (since this one is a superset of features and since the shortcuts overlap), so to avoid conflicts, it will prompt you to disable one before activating this one.

## The Extension

This extension shows reference search results as separate view, just like search results. It complements the peek view presentation that is also built into VS Code. The following features are available:

- List all references (or assignments) via the Command Palette, the Context Menu, or via keyboard shortcuts:
  | Command | Default Keyboard Shortcut |
  | --- | --- |
  | Find All References | <kbd>Shift+Alt+F12</kbd> |
  | Find All Assignments | <kbd>Shift+Alt+F11</kbd> |
  | Go To References | <kbd>Shift+F12</kbd> |
  | Go To Assignments | <kbd>Shift+F11</kbd> |
- View references in a dedicated tree view that sits in the sidebar:
  - Filter to assignments
  - Switch between list and tree views
- Navigate through search results via <kbd>F4</kbd> and <kbd>Shift+F4</kbd>
- Remove references from the list via inline commands

## Development

This repo uses [pnpm](https://pnpm.io/) for package management, [prettier](https://prettier.io/) for code formatting, and [typescript-eslint](https://typescript-eslint.io/) for code styling.

## Issues/Contributing

Bug reports, feature suggestions/requests, and pull requests are welcome, though for any pull requests, please try to review the style of the existing code and try to match that. I may make updates to PRs or make new branches on top of PRs to help them match the styling (beyond just Prettier, to include naming, types specification, code layout, etc.), while still crediting the PR creator.
