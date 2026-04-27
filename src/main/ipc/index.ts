import { registerFileIpc } from './fileIpc'
import { registerImageIpc } from './imageIpc'
import { registerIrcIpc } from './ircIpc'
import { registerTerminalIpc } from './terminalIpc'

export function registerAllIpc(): void {
  registerFileIpc()
  registerImageIpc()
  registerIrcIpc()
  registerTerminalIpc()
}
