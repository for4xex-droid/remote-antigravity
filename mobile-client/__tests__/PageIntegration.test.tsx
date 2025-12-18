import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Home from '@/app/page'
import { io } from 'socket.io-client'

// scrollIntoView のモック (MessageListで使用)
window.HTMLElement.prototype.scrollIntoView = jest.fn()

// Socket.io-client のモック
jest.mock('socket.io-client')
const mockIo = io as jest.MockedFunction<typeof io>

describe('Page Integration', () => {
    let mockSocket: any
    let eventHandlers: { [key: string]: Function } = {}

    beforeEach(() => {
        jest.useFakeTimers()

        // イベントハンドラをキャプチャするためのモック実装
        eventHandlers = {}
        mockSocket = {
            on: jest.fn((event, callback) => {
                eventHandlers[event] = callback
                // 接続イベントを即座に発火
                if (event === 'connect') {
                    setTimeout(() => callback(), 0)
                }
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
        jest.runOnlyPendingTimers()
        jest.useRealTimers()
        jest.clearAllMocks()
    })

    it('renders the initial UI correctly', async () => {
        render(<Home />)

        // ヘッダーが表示されていること
        expect(screen.getByText('Antigravity')).toBeInTheDocument()

        // 入力欄が表示されていること
        expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument()

        // ステータスが表示されていること
        expect(screen.getByText(/ready/i)).toBeInTheDocument()
    })

    it('shows connecting status before socket connects', () => {
        // 接続イベントを発火させない
        mockSocket.on = jest.fn()
        render(<Home />)

        expect(screen.getByText(/connecting/i)).toBeInTheDocument()
    })

    it('sends message and updates local state', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
        render(<Home />)

        // 接続状態をシミュレート
        act(() => {
            if (eventHandlers['connect']) {
                eventHandlers['connect']()
            }
        })

        const input = screen.getByPlaceholderText('Type a message...')
        const sendButton = screen.getByRole('button', { name: /send message/i })

        // メッセージを入力して送信
        await user.type(input, 'Hello Agent')
        await user.click(sendButton)

        // ユーザーのメッセージが表示されること
        expect(screen.getByText('Hello Agent')).toBeInTheDocument()

        // socket.emitが呼ばれたこと
        expect(mockSocket.emit).toHaveBeenCalledWith('chat:send', expect.objectContaining({
            content: 'Hello Agent'
        }))
    })

    it('receives agent response via socket event', async () => {
        render(<Home />)

        // 接続をシミュレート
        act(() => {
            if (eventHandlers['connect']) {
                eventHandlers['connect']()
            }
        })

        // エージェントからの応答をシミュレート
        act(() => {
            if (eventHandlers['chat:receive']) {
                eventHandlers['chat:receive']({
                    id: '123',
                    role: 'agent',
                    content: 'Hello from Agent!',
                    timestamp: Date.now()
                })
            }
        })

        expect(screen.getByText('Hello from Agent!')).toBeInTheDocument()
    })

    it('updates status based on agent:status event', () => {
        render(<Home />)

        act(() => {
            if (eventHandlers['connect']) {
                eventHandlers['connect']()
            }
        })

        // thinking ステータスをシミュレート
        act(() => {
            if (eventHandlers['agent:status']) {
                eventHandlers['agent:status']({ status: 'thinking' })
            }
        })

        expect(screen.getByText(/thinking/i)).toBeInTheDocument()
    })
})
