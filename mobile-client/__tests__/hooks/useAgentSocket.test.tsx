import { renderHook, act } from '@testing-library/react'
import { useAgentSocket } from '@/hooks/useAgentSocket'
import { io } from 'socket.io-client'

// Socket.io-client のモック
jest.mock('socket.io-client')
const mockIo = io as jest.MockedFunction<typeof io>

describe('useAgentSocket Hook', () => {
    let mockSocket: any
    let eventHandlers: { [key: string]: Function } = {}

    beforeEach(() => {
        // イベントハンドラをキャプチャするためのモック実装
        eventHandlers = {}
        mockSocket = {
            on: jest.fn((event, callback) => {
                eventHandlers[event] = callback
            }),
            off: jest.fn(),
            emit: jest.fn(),
            disconnect: jest.fn(),
            connect: jest.fn(),
            connected: true,
        }
        mockIo.mockReturnValue(mockSocket as any)
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('initializes socket connection on mount', () => {
        renderHook(() => useAgentSocket())
        expect(mockIo).toHaveBeenCalled()
    })

    it('updates messages when "chat:receive" event occurs', () => {
        const { result } = renderHook(() => useAgentSocket())

        // 初期状態確認
        expect(result.current.messages).toEqual([])

        // サーバーからのメッセージ受信をシミュレート
        const incomingMessage = {
            id: '123',
            role: 'agent',
            content: 'Hello from Server',
            timestamp: Date.now()
        }

        act(() => {
            if (eventHandlers['chat:receive']) {
                eventHandlers['chat:receive'](incomingMessage)
            }
        })

        // ステートが更新されたか確認
        expect(result.current.messages).toHaveLength(1)
        expect(result.current.messages[0].content).toBe('Hello from Server')
    })

    it('updates status when "agent:status" event occurs', () => {
        const { result } = renderHook(() => useAgentSocket())

        // 初期状態
        expect(result.current.status).toBe('idle')

        act(() => {
            if (eventHandlers['agent:status']) {
                eventHandlers['agent:status']({ status: 'thinking' })
            }
        })

        expect(result.current.status).toBe('thinking')
    })

    it('sends message via socket when sendMessage is called', () => {
        const { result } = renderHook(() => useAgentSocket())

        act(() => {
            result.current.sendMessage('Hello Agent')
        })

        // "chat:send" イベントがemitされたか確認
        expect(mockSocket.emit).toHaveBeenCalledWith('chat:send', expect.objectContaining({
            content: 'Hello Agent'
        }))

        // ユーザーのメッセージがローカルに追加されたか確認
        expect(result.current.messages).toHaveLength(1)
        expect(result.current.messages[0].role).toBe('user')
    })

    it('disconnects socket on unmount', () => {
        const { unmount } = renderHook(() => useAgentSocket())
        unmount()
        expect(mockSocket.disconnect).toHaveBeenCalled()
    })
})
