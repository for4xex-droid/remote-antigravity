import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatInput from '@/components/ChatInput'

describe('ChatInput', () => {
    const setup = (props = {}) => {
        const handleSend = jest.fn()
        const utils = render(<ChatInput onSend={handleSend} isLoading={false} {...props} />)
        const user = userEvent.setup()
        const input = screen.getByPlaceholderText('Type a message...')
        // Look for button by its accessible name (aria-label or text content)
        const button = screen.getByRole('button', { name: /send message/i })
        return { ...utils, user, input, button, handleSend }
    }

    it('renders input field and send button', () => {
        setup()
        expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument()
    })

    it('calls onSend with input text when form is submitted', async () => {
        const { user, input, button, handleSend } = setup()

        await user.type(input, 'Hello Agent')
        await user.click(button)

        expect(handleSend).toHaveBeenCalledWith('Hello Agent')
        expect(input).toHaveValue('') // Should clear after send
    })

    it('does not send if input is only whitespace', async () => {
        const { user, input, button, handleSend } = setup()

        await user.type(input, '   ')
        await user.click(button)

        expect(handleSend).not.toHaveBeenCalled()
    })

    it('submits when pressing Enter (without Shift)', async () => {
        const { user, input, handleSend } = setup()

        await user.type(input, 'Hello Agent{enter}')

        expect(handleSend).toHaveBeenCalledWith('Hello Agent')
    })

    it('does not submit when pressing Shift+Enter', async () => {
        const { user, input, handleSend } = setup()

        await user.type(input, 'Hello Agent{Shift>}{enter}{/Shift}')

        expect(handleSend).not.toHaveBeenCalled()
        // Input should still contain the text (and potentially a newline, though userEvent might vary)
        expect(input).toHaveValue('Hello Agent\n')
    })

    it('disables input and shows stop button when loading', () => {
        render(<ChatInput onSend={() => { }} isLoading={true} />)

        expect(screen.getByPlaceholderText('Type a message...')).toBeDisabled()
        expect(screen.queryByRole('button', { name: /send message/i })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: /stop generating/i })).toBeInTheDocument()
    })
})
