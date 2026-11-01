# Side-by-side Saina Ollama on Windows

This installs and runs the Saina Helm runtime beside the existing stock Ollama. It does not replace, rename, uninstall, or reconfigure the stock installation.

| Runtime | Executable | Model directory | API |
| --- | --- | --- | --- |
| Stock Ollama (Gemma, Qwen, embeddings, chat) | `C:\Users\<user>\AppData\Local\Programs\Ollama\ollama.exe` | Existing stock default | `http://127.0.0.1:11434` |
| Saina (Helm only) | `D:\tools\ollama-saina\ollama.exe` | `D:\models\saina-helm-models` | `http://127.0.0.1:11435` |

The Saina server gets `OLLAMA_HOST` and `OLLAMA_MODELS` only in the PowerShell process that launches it. The machine-wide/user-wide variables and the stock Ollama Windows app remain unchanged. Do not add the Saina directory to PATH or configure it as the default Ollama service.

## Obtain/build the Saina executable

The requested source branch is [ramarlina/ollama `saina-helm-3`](https://github.com/ramarlina/ollama/tree/saina-helm-3). The branch is publicly fetchable. No verified Windows release artifact for that branch was found during this implementation, so build from source and verify the resulting executable before using it.

Clone that branch into a separate source directory and read its own development/build instructions first, because this feature branch may predate current Ollama build steps:

```powershell
git clone --branch saina-helm-3 --single-branch https://github.com/ramarlina/ollama.git D:\src\ollama-saina
Set-Location D:\src\ollama-saina
```

The [current upstream Windows guide](https://github.com/ollama/ollama/blob/main/docs/development.md) lists Visual Studio 2022 with the Native Desktop workload and CMake 3.24+; it describes a CMake native payload build (`cmake -B build .`, `cmake --build build --parallel 8`) and optional Vulkan support. Older Ollama branch instructions may instead require Go 1.22+, MSYS2 clang tools, `make`, then `go build .`. Use the instructions and dependencies present on the checked-out Saina branch; do not assume current `main` is source-compatible with it. For a CMake build, stage the resulting `ollama.exe` and its `build\lib\ollama` native payload under `D:\tools\ollama-saina` (preserving the expected `lib\ollama` layout); follow the branch's own packaging instructions if its output layout differs.

If the Saina branch does not build on native Windows with its required dependencies, that is a build blocker: do not copy over the stock executable. Use a separately isolated Windows-compatible build or a separate WSL/Linux host and configure `AM_STAGE_SAINA_BASE_URL` to its reachable URL. The starter scripts assume a native Windows executable and do not claim the custom branch has been built or GPU-tested here.

Ollama builds may require runtime libraries/assets alongside the executable. If `ollama.exe serve` reports missing DLLs or runner assets, follow that branch's packaging instructions and place only its Saina runtime files in `D:\tools\ollama-saina`; do not use the stock folder as the output directory.

## Start and pull the model

In one PowerShell window, start Saina and leave it running:

```powershell
.\scripts\start-saina-serve.ps1
```

The script starts `D:\tools\ollama-saina\ollama.exe serve` with `OLLAMA_HOST=127.0.0.1:11435` and `OLLAMA_MODELS=D:\models\saina-helm-models`. In a second PowerShell window, pull the Helm model through that dedicated endpoint:

```powershell
.\scripts\pull-saina-helm-model.ps1
```

This pulls `run-saina/saina-helm-3-0.8b` (~1.7 GB) into the Saina model directory. Verify `http://127.0.0.1:11435/api/tags` lists the model and that the Saina build exposes `/v1/systemone`. Stop the process with Ctrl+C when finished. The app never starts this server automatically.

## App configuration and resource policy

Set this key in the app server environment (for example, `.env.local`) only if using a non-default Saina address:

```dotenv
AM_STAGE_SAINA_BASE_URL=http://127.0.0.1:11435
AM_STAGE_SAINA_HELM_MODEL=run-saina/saina-helm-3-0.8b
```

`AM_STAGE_SAINA_BASE_URL` defaults to `http://127.0.0.1:11435` and is used only by the explicit AM-Stage Helm action. General Ollama settings (`OLLAMA_BASE_URL` and the app's `ollamaUrl`) continue to target stock Ollama at 11434 for Gemma, Qwen, embeddings, and chat. Helm will not fall back to the general Ollama URL.

Helm remains click-to-run. The existing single-model slot is acquired, loaded models on the general Ollama runtime are unloaded before the Helm call, and the request uses `keep_alive: 0`. Do not run Helm concurrently with CLAP, SigLIP, Gemma, or Qwen on the RX570 8 GB / 16 GB RAM machine. The optional CLAP gate remains off. This change does not load a model on Dashboard navigation or rebuild any index.

The Helm API reports a clear unavailable-runtime error when 11435 cannot be reached and an install hint when the configured Saina runtime is reachable but the model tag is absent. Gender and Vakgyata continue through their existing CPU-only path.

## Verification status

The script and app configuration are implemented in the repository. This change does not install/build Saina, download the Helm weights, launch a second Ollama server, or claim measured VRAM usage. End-to-end Helm inference and the RX570 memory footprint remain unverified until the Saina Windows build and model are available.
