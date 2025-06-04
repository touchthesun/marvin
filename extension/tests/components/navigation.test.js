// extension/tests/components/navigation.test.js
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Navigation } from '../../src/components/navigation';

describe('Navigation Component', () => {
  beforeEach(() => {
    // Reset any mocks or state before each test
  });

  test('renders navigation items', () => {
    render(<Navigation />);
    
    // Check if navigation items are present
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Capture')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  test('handles navigation item clicks', async () => {
    const user = userEvent.setup();
    render(<Navigation />);
    
    // Click a navigation item
    await user.click(screen.getByText('Capture'));
    
    // Verify the click was handled
    expect(screen.getByText('Capture')).toHaveClass('active');
  });
});