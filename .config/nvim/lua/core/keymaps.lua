vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

vim.opt.backspace = '2'

vim.opt.tabstop = 4       -- How many spaces a tab counts for
vim.opt.shiftwidth = 4    -- Indent size (e.g., for `>>` or auto-indent)
vim.opt.softtabstop = 4   -- Spaces inserted when pressing <Tab>
vim.opt.expandtab = true  -- Convert tabs to spaces (recommended)

vim.keymap.set('n', '<leader>h', ':nohlsearch<CR>')
vim.keymap.set('n', '<leader>ff', ':Telescope current_buffer_fuzzy_find<CR>')
vim.keymap.set('n', '<leader>fg', ':Telescope live_grep<CR>')
vim.keymap.set('n', '<leader>"', ':split | term<CR>', { noremap = true, silent = true })
vim.keymap.set('n', '<leader>%', ':vsplit | term<CR>', { noremap = true, silent = true })

-- Only allow terminal navigation with <leader> prefix
vim.keymap.set('n', '<C-h>', '<C-w>h', { noremap = true, silent = true })
vim.keymap.set('n', '<C-j>', '<C-w>j', { noremap = true, silent = true })
vim.keymap.set('n', '<C-k>', '<C-w>k', { noremap = true, silent = true })
vim.keymap.set('n', '<C-l>', '<C-w>l', { noremap = true, silent = true })
