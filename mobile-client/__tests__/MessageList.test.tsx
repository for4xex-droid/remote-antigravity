import { render, screen } from '@testing-library/react'
import MessageList from '@/components/MessageList'
import { Message } from '@/types/agent'

// Mock Data
const mockMessages: Message[] = [
    {
        id: '1',
        role: 'user',
        content: 'Create a hello world function.',
        timestamp: Date.now()
    },
    {
        id: '2',
        role: 'agent',
        content: 'Here is the code:\n```javascript\nconsole.log("Hello");\n```',
        timestamp: Date.now() + 1000
    }
]

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = jest.fn()

describe('MessageList', () => {
    it('renders a list of messages', () => {
        render(<MessageList messages={mockMessages} />)
        expect(screen.getByText('Create a hello world function.')).toBeInTheDocument()
        expect(screen.getByText(/Here is the code/)).toBeInTheDocument()
    })

    it('aligns user messages to the right and agent messages to the left', () => {
        render(<MessageList messages={mockMessages} />)

        // Since we have nested divs, we need to traverse up to find the container with justify-* classes
        // structure: motion.div(justify) > div(flex-row) > div(message-body) > text
        const userMsgContainer = screen.getByText('Create a hello world function.').closest('div[class*="justify-end"]')
        const agentMsgContainer = screen.getByText(/Here is the code/).closest('div[class*="justify-start"]')

        expect(userMsgContainer).toBeInTheDocument()
        expect(agentMsgContainer).toBeInTheDocument()
    })

    it('renders markdown code blocks as text (temporary)', () => {
        const { container } = render(<MessageList messages={mockMessages} />)

        // Check if code content is rendered
        expect(screen.getByText(/console.log\("Hello"\);/)).toBeInTheDocument()
    })

    it('displays empty state when no messages', () => {
        render(<MessageList messages={[]} />)
        // Expect a list role to define the message area
        const list = screen.getByRole('list')
        expect(list).toBeInTheDocument()
        // It might be empty or show a placeholder, here we check valid container exists
        // Use querySelectorAll to check for message items specifically, or check children length including scroll anchor
        expect(list.children.length).toBeGreaterThanOrEqual(1) // div with ref is always there
    })

    it('scrolls to bottom when new message arrives', () => {
        const { rerender } = render(<MessageList messages={mockMessages} />)

        // Add new message
        const newMessages: Message[] = [
            ...mockMessages,
            { id: '3', role: 'user', content: 'Thanks!', timestamp: Date.now() + 2000 }
        ]

        rerender(<MessageList messages={newMessages} />)

        expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
    })
})
