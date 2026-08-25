import { app, nativeImage, shell } from 'electron'
import { RpcTarget } from 'capnweb'
import { mkdtemp, readFile, rm, writeFile, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { WorkspaceFilesService as WorkspaceFilesContract } from '@shared/host/appHost'
import { saveCopyWithDialog } from './OpenInService'

/**
 * 工作区文件读写。
 *
 * 取证：Codex 的 `workspaceFiles`（`nfe`）方法是
 * `read / write / saveCopy / downloadCopy / createTemporaryFile /
 *  releaseTemporaryFile / getDownloadsFolderIcon`。
 *
 * 边界说明（重要）：Codex 的**文件树与文件内容不走这个服务**，而是走
 * app-server 的 `fs/readDirectory` / `fs/readFile` —— 因为工作区可能在远端
 * （ssh/wsl/remote-control），只有 app-server 那一侧才知道"文件在哪台机器上"。
 * 这个服务负责的是**本机侧的文件动作**：另存为、下载副本、临时文件、图标。
 * 本项目的文件树因此也改走 `fs/*`，不再有 `file:listDir` 这类 IPC。
 */
export class WorkspaceFilesService extends RpcTarget implements WorkspaceFilesContract {
  private readonly temporaryFiles = new Set<string>()

  async read(path: string): Promise<string> {
    return readFile(path, 'utf8')
  }

  async write(path: string, contents: string): Promise<void> {
    await writeFile(path, contents, 'utf8')
  }

  saveCopy(path: string, suggestedName?: string): Promise<boolean> {
    return saveCopyWithDialog(path, suggestedName)
  }

  /** 不弹对话框，直接落到下载目录；返回最终路径 */
  async downloadCopy(path: string, suggestedName?: string): Promise<string | null> {
    const target = join(app.getPath('downloads'), suggestedName ?? basenameOf(path))
    try {
      await copyFile(path, target)
      return target
    } catch {
      return null
    }
  }

  /**
   * 临时文件：渲染层要把内存里的内容交给外部程序（编辑器 / diff 工具）时用。
   * 必须显式 release —— 目录留在 tmp 里不清会随使用无限增长。
   */
  async createTemporaryFile(name: string, contents: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'workstudio-'))
    const path = join(dir, name)
    await writeFile(path, contents, 'utf8')
    this.temporaryFiles.add(dir)
    return path
  }

  async releaseTemporaryFile(path: string): Promise<void> {
    for (const dir of this.temporaryFiles) {
      if (path.startsWith(dir)) {
        this.temporaryFiles.delete(dir)
        await rm(dir, { recursive: true, force: true })
        return
      }
    }
  }

  /** 下载目录的系统图标（Codex 用它画「已保存到下载」的提示） */
  async getDownloadsFolderIcon(): Promise<string | null> {
    try {
      const icon = await nativeImage.createThumbnailFromPath(app.getPath('downloads'), {
        width: 32,
        height: 32
      })
      return icon.isEmpty() ? null : icon.toDataURL()
    } catch {
      return null
    }
  }

  /** 清理所有未 release 的临时目录（退出前调用） */
  async dispose(): Promise<void> {
    await Promise.all(
      Array.from(this.temporaryFiles, (dir) => rm(dir, { recursive: true, force: true }))
    )
    this.temporaryFiles.clear()
  }

  /** 在系统文件管理器里定位（侧栏项目卡片的路径行） */
  showItemInFolder(path: string): void {
    shell.showItemInFolder(path)
  }
}

function basenameOf(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] ?? 'file'
}
