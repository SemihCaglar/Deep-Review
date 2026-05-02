export interface RegisterPaperDto {
    title: string;
    abstractText: string;
    topics: string[]; // UUIDs of the topics
    authors?: string[]; // Array of User UUIDs who are authors
    overleafLink: string;
    labId?: string; // Optional selected lab context for multi-lab members

    parentPaperIds?: string[]; // IDs of any parent papers
    collaboratingLabIds?: string[]; // Lab IDs to invite for cross-lab collaboration
}

export interface UpdatePaperDto {
    title?: string;
    abstractText?: string;
    topics?: string[];
    overleafLink?: string;

    status?: string;
}
