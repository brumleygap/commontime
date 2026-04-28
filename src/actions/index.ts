import { createPoll, lockPoll } from "./polls";
import { submitVote } from "./votes";
import { sendMagicLink } from "./auth";

export const server = {
    createPoll,
    lockPoll,
    submitVote,
    sendMagicLink,
};
