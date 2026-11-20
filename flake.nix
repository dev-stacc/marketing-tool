{
  description = "Marketing Tool - Nuxt 4 dashboard on an in-process database";
  
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };
  
  outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in {
        devShells.default = pkgs.mkShell {
          name = "marketing-tool-dev";
          
          packages = with pkgs; [
            nodejs_22
            typescript
            typescript-language-server
            vscode-langservers-extracted
            tailwindcss-language-server
            vtsls
            gnumake
            python3
            git
            curl
            jq
          ];
          
          shellHook = ''
            echo "Marketing Tool Development Environment"
            echo "Node: $(node --version)"
            echo "npm: $(npm --version)"
            echo ""
            
            # Load .env if it exists
            if [ -f ".env" ]; then
              echo "Loading environment from .env"
              set -a
              source .env
              set +a
              echo "Environment loaded"
            fi
            
            # Install dependencies if needed
            if [ ! -d "node_modules" ]; then
              echo "Installing dependencies..."
              npm install
            fi
            
            echo ""
            echo "Ready! Run: npm run dev"
          '';
        };
      });
}
