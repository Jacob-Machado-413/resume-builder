{
  description = "Resume builder: .NET + React front end for rendercv";

  inputs.nixpkgs.url = "https://flakehub.com/f/NixOS/nixpkgs/0.1";

  outputs =
    { self, ... }@inputs:

    let
      inherit (inputs.nixpkgs) lib;

      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];

      forEachSupportedSystem =
        f:
        lib.genAttrs supportedSystems (
          system:
          f {
            pkgs = import inputs.nixpkgs { inherit system; };
          }
        );
    in
    {
      devShells = forEachSupportedSystem (
        { pkgs }:
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              dotnet-sdk_10
              omnisharp-roslyn
              mono
              # msbuild omitted: the legacy Mono package is broken upstream, and dotnet-sdk_10 bundles MSBuild.
              nodejs_22
              rendercv
            ];

            # Lets editor tooling (C# Dev Kit, OmniSharp) find the SDK.
            DOTNET_ROOT = "${pkgs.dotnet-sdk_10}/share/dotnet";
            DOTNET_CLI_TELEMETRY_OPTOUT = "1";
            DOTNET_NOLOGO = "1";
          };
        }
      );
    };
}
