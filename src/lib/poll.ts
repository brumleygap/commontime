// chosen_option_id is the authoritative "is this poll locked?" sentinel.
// chosen_poll_options holds the full list of chosen slots for display.
// SQL equivalent: chosen_option_id IS NOT NULL
export function isPollLocked(poll: { chosen_option_id: number | null }): boolean {
    return poll.chosen_option_id !== null;
}
