# Markdown beyond the terminal

Readable text and **rich presentation** share one document. Unicode: café 文 😀.

## Explore with Neovim

- Move with `j` and `k` to reveal the matching source block.
- Press **i** for rich interaction.
- Return with `Ctrl-\`, then `Ctrl-N`.

> Text extraction runs independently of the rich page.

```lua
require("jusi_neovim").open("markdown", "/path/to/notes.md")
```

| Feature | Test viewer |
| --- | --- |
| Headings and lists | Rendered |
| Source navigation | Block ranges |
| Optional text | Supported |

[Visit Neovim](https://neovim.io)

![Image placeholder](not-loaded.png)

<script>document.body.dataset.unsafe = "true"</script>
