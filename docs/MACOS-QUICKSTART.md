# Jusi Neovim on Apple Silicon

The local alpha uses an installed Neovim executable. Run `nvim --version` in
Terminal to check it. The tested version is 0.11.4.

1. Open the DMG from your intended build directory. Several builds can have
   the same version and filename. Quit any older copy, drag **Jusi Neovim**
   into **Applications**, and choose **Replace** if prompted.
2. Open **Jusi Neovim** from Applications. It loads your usual Neovim config.
   Run `:JusiWebBuffer https://example.com` to open a browser buffer. Press
   `i` to interact with the page, Ctrl-\\ then Ctrl-N for Neovim navigation,
   and Ctrl-Q to close the browser buffer.
3. Use `:JusiWebProfile` to inspect the current profile and the default for
   new buffers. Select another with `:JusiWebProfile work`, then open a new
   buffer. Persistent cookies survive a full quit until they expire. For a
   fresh in-memory session use `:JusiWebPrivate https://example.com`.

To troubleshoot startup, quit the app and run this in Terminal. Clean mode
skips your Neovim init file and still loads the bundled browser commands.
It uses the same persistent browser profiles.

```sh
JUSI_NVIM_CLEAN=1 "/Applications/Jusi Neovim.app/Contents/MacOS/Jusi Neovim"
```

If the startup alert says Neovim could not be launched, check the executable
path in the alert. To use a specific installation, set `JUSI_NVIM` to its
absolute executable path when launching from Terminal.

To build the unsigned local package from a checkout, use Node 24 and run
`npm ci`, then `npm run dist:mac`. The DMG and ZIP are written to `release/`.
Development launches with `npm run electron` keep their own browser profiles.
This alpha was checked on macOS arm64. Real IME input and final release
acceptance remain open.
