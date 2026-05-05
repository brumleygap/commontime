import { createPoll, lockPoll, unlockPoll, cancelPoll, uncancelPoll, inviteParticipants } from "./polls";
import { submitVote } from "./votes";
import { sendMagicLink } from "./auth";

export const server = {
    createPoll,
    lockPoll,
    unlockPoll,
    cancelPoll,
    uncancelPoll,
    inviteParticipants,
    submitVote,
    sendMagicLink,
};
