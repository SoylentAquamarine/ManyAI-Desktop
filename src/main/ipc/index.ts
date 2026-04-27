import { registerFileIpc } from './fileIpc'
import { registerImageIpc } from './imageIpc'
import { registerIrcIpc } from './ircIpc'

export function registerAllIpc(): void {
  registerFileIpc()
  registerImageIpc()
  registerIrcIpc()
}
