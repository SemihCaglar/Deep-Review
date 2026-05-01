export interface RegisterPaperDto {
    title: string;
    abstractText: string;
    targetVenue: string;
    topics: string[]; // UUIDs of the topics
    authors?: string[]; // Array of User UUIDs who are authors
    overleafLink?: string;
    overleafGitUrl?: string;
    parentPaperIds?: string[]; // IDs of any parent papers
}

export interface UpdatePaperDto {
    title?: string;
    abstractText?: string;
    targetVenue?: string;
    topics?: string[];
    overleafLink?: string;
    overleafGitUrl?: string;
    status?: string;
}
