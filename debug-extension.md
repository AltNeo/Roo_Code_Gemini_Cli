# Debugging Roo Code Custom Extension

## Changes Made

1. **Changed extension name and identifiers to avoid marketplace conflicts:**

    - Name: `roo-cline-custom`
    - Display Name: "Roo Code Custom (With Gemini CLI)"
    - Publisher: `CustomBuild`
    - Repository URLs updated to avoid confusion

2. **Fixed webview build paths:**

    - Updated Vite config to use relative paths (`base: "./"`)
    - Fixed HTML asset references to use relative paths

3. **Fixed build scripts:**
    - Updated `vscode:prepublish` script to use `node esbuild.mjs --production` instead of pnpm

## Installation

The custom extension is now packaged as: `bin/roo-cline-custom-3.27.0.vsix`

To install:

1. Open VS Code
2. Go to Extensions view (Ctrl+Shift+X)
3. Click the "..." menu → "Install from VSIX..."
4. Select the `roo-cline-custom-3.27.0.vsix` file

## Debugging Steps

If the extension shows a blank screen:

1. **Check the VS Code Developer Console:**

    - Press F12 or Ctrl+Shift+I
    - Look for any JavaScript errors in the Console tab
    - Look for failed network requests in the Network tab

2. **Check VS Code Output Panel:**

    - View → Output
    - Select "Roo-Code" from the dropdown
    - Look for error messages

3. **Check Extension Host Log:**

    - Help → Toggle Developer Tools
    - Look for extension activation errors

4. **Verify webview resources are loading:**
    - In Developer Tools, check if these files are loading:
        - `webview-ui/build/assets/index.js`
        - `webview-ui/build/assets/index.css`
        - `webview-ui/build/assets/mermaid-bundle.js`

## Common Issues and Solutions

### Issue: Blank webview screen

**Possible Causes:**

- JavaScript bundle not loading due to CSP (Content Security Policy) restrictions
- Missing or incorrect asset paths
- React app not mounting properly

**Solutions:**

1. Check browser console for CSP violations
2. Verify all asset files exist in `src/webview-ui/build/assets/`
3. Check if the main React component is rendering

### Issue: Extension not activating

**Possible Causes:**

- Missing dependencies
- Activation events not triggering
- Extension manifest issues

**Solutions:**

1. Check that all required files are in the VSIX
2. Verify activation events in package.json
3. Check VS Code extension host logs

## Testing the Extension

1. **Open the extension sidebar:**

    - Look for "Roo Code Custom" in the Activity Bar (left sidebar)
    - Click on it to open the webview

2. **Test basic functionality:**

    - Try opening settings
    - Check if the chat interface loads
    - Verify that buttons are clickable

3. **Test Gemini CLI integration:**
    - Go to Settings → API Configuration
    - Look for Gemini CLI options
    - Test API key configuration

## File Structure

The extension now includes:

- `dist/extension.js` - Main extension code
- `webview-ui/build/` - React UI build
- `assets/` - Icons and static resources
- Localization files for multiple languages

## Next Steps

If issues persist:

1. Enable VS Code extension development mode
2. Use F5 to launch Extension Development Host
3. Set breakpoints in the extension code
4. Check webview console for React errors
