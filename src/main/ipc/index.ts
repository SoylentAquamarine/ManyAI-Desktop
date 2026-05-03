import { registerFileIpc } from './fileIpc'
import { registerImageIpc } from './imageIpc'
import { registerIrcIpc } from './ircIpc'
import { registerTerminalIpc } from './terminalIpc'
import { registerDbIpc } from './dbIpc'
import { registerMcpIpc } from './mcpIpc'

export function registerAllIpc(): void {
  registerDbIpc()
  registerFileIpc()
  registerImageIpc()
  registerIrcIpc()
  registerTerminalIpc()
  registerMcpIpc()
}
