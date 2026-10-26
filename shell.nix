# Development shell for `nix-shell`; the real definition lives in flake.nix (`nix develop` / direnv).
(builtins.getFlake "path:${toString ./.}").devShells.${builtins.currentSystem}.default
