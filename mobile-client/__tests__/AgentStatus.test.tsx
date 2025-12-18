import { render, screen } from '@testing-library/react'
import AgentStatus from '@/components/AgentStatus'

describe('AgentStatus', () => {
    // Config for expected values based on status
    const statusConfig = {
        idle: { text: /ready/i, iconLabel: /standby icon/i },
        thinking: { text: /thinking/i, iconLabel: /processing icon/i },
        acting: { text: /executing/i, iconLabel: /tool icon/i },
        error: { text: /error/i, iconLabel: /alert icon/i },
    }

    it('displays correct text and icon for idle status', () => {
        render(<AgentStatus status="idle" />)

        expect(screen.getByText(statusConfig.idle.text)).toBeInTheDocument()
        expect(screen.getByLabelText(statusConfig.idle.iconLabel)).toBeInTheDocument()
        expect(screen.getByRole('status')).toBeInTheDocument()
    })

    it('displays correct text and animation for thinking status', () => {
        render(<AgentStatus status="thinking" />)

        expect(screen.getByText(statusConfig.thinking.text)).toBeInTheDocument()

        const icon = screen.getByLabelText(statusConfig.thinking.iconLabel)
        expect(icon).toBeInTheDocument()
        // "thinking" status should have a spinning animation on the icon
        expect(icon).toHaveClass('animate-spin')
    })

    it('displays correct text and pulsing indicator for acting status', () => {
        render(<AgentStatus status="acting" />)

        expect(screen.getByText(statusConfig.acting.text)).toBeInTheDocument()
        expect(screen.getByLabelText(statusConfig.acting.iconLabel)).toBeInTheDocument()

        // The container should pulse to indicate activity
        const statusContainer = screen.getByRole('status')
        expect(statusContainer).toHaveClass('animate-pulse')
        // Acting usually implies a specific active color (e.g., blue)
        expect(statusContainer).toHaveClass('text-blue-400')
    })

    it('displays error state with alert styling', () => {
        render(<AgentStatus status="error" />)

        expect(screen.getByText(statusConfig.error.text)).toBeInTheDocument()
        expect(screen.getByLabelText(statusConfig.error.iconLabel)).toBeInTheDocument()

        const statusContainer = screen.getByRole('status')
        // Error should have red styling
        expect(statusContainer).toHaveClass('text-red-400')
    })
})
