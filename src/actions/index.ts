import { createPoll } from "./polls";
import { submitVote } from "./votes";
import { sendMagicLink } from "./auth";

export const server = {
    createPoll,
    submitVote,
    sendMagicLink,
};
