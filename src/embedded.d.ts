// What esbuild.config.mjs puts into main.js beside the plugin's own code.

/** .NET's loader (wasm/out's dotnet.js), bundled as a dependency: the part of its API bibmd uses. */
declare module "bibmd-dotnet" {
  /** Where the loader gets a file it needs: a URL for a JavaScript module, a response for the rest. */
  export type ResourceLoader = (type: string, name: string, defaultUri: string, integrity: string, behavior: string)
    => string | Promise<Response> | null;

  export interface RuntimeAPI {
    runMain(): Promise<number>;
    getAssemblyExports(assemblyName: string): Promise<unknown>;
  }

  export interface DotnetHostBuilder {
    withResourceLoader(loader: ResourceLoader): DotnetHostBuilder;
    create(): Promise<RuntimeAPI>;
  }

  export const dotnet: DotnetHostBuilder;
}

/** The rest of the .NET app (wasm/package.mjs's zip): assemblies, the runtime and bibui's module. */
declare module "bibmd-wasm-zip" {
  const zip: Uint8Array;
  export default zip;
}
