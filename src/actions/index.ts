import { createPoll } from "./polls";
import { submitVoteDebug } from "./votes";
import { sendMagicLink } from "./auth";

export const server = {
    createPoll,
    submitVoteDebug,
    sendMagicLink,
};
