/**
 * workingDir.ts — Manages the user's chosen working directory.
 *
 * The working directory is the root folder for all ManyAI file output:
 *   {workingDir}/images/   — auto-saved generated images
 *   {workingDir}/manyai.log — application log
 *   {workingDir}/backups/  — config backup files
 *
 * The chosen path is persisted in localStorage so it survives restarts.
 */

const LS_KEY = 'manyai_working_dir'

/** Return the currently configured working directory, or '' if not set. */
export function getWorkingDir(): string {
  return localStorage.getItem(LS_KEY) ?? ''
}

/** Persist a new working directory path. */
export function setWorkingDir(dir: string): void {
  if (dir) {
    localStorage.setItem(LS_KEY, dir)
  } else {
    localStorage.removeItem(LS_KEY)
  }
}

/** Return the images sub-folder path, or '' if no working dir is set. */
export function getImagesDir(): string {
  const base = getWorkingDir()
  return base ? `${base}/images` : ''
}

/** Return the backups sub-folder path, or '' if no working dir is set. */
export function getBackupsDir(): string {
  const base = getWorkingDir()
  return base ? `${base}/backups` : ''
}

/** Return the log file path, or '' if no working dir is set. */
export function getLogPath(): string {
  const base = getWorkingDir()
  return base ? `${base}/manyai.log` : ''
}

/**
 * Ensure the images sub-directory exists.
 * Returns true on success, false if no working dir is configured or mkdir fails.
 */
export async function ensureImagesDir(): Promise<boolean> {
  const dir = getImagesDir()
  if (!dir) return false
  const result = await window.api.ensureDir(dir)
  return !('error' in result)
}

/**
 * Save a data-URI image to {workingDir}/images/{filename}.
 * Returns the path on success, or null on failure.
 */
export async function saveImageToWorkingDir(dataUri: string, filename: string): Promise<string | null> {
  const dir = getImagesDir()
  if (!dir) return null

  await window.api.ensureDir(dir)

  const filePath = `${dir}/${filename}`

  const result = await window.api.writeImageFile(filePath, dataUri)
  return 'ok' in result ? filePath : null
}
