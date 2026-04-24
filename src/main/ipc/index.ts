import { registerFileIpc } from './fileIpc'
import { registerImageIpc } from './imageIpc'

export function registerAllIpc(): void {
  registerFileIpc()
  registerImageIpc()
}
