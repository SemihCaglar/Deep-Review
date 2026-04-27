export interface RegisterPaperDto {
    title: string;
    abstractText: string;
    targetVenue: string;
    topics: string[]; // UUIDs of the topics
    overleafLink?: string;
    parentPaperIds?: string[]; // IDs of any parent papers
}

export interface UpdatePaperDto {
    title?: string;
    abstractText?: string;
    targetVenue?: string;
    topics?: string[];
    overleafLink?: string;
    status?: string; // E.g., 'Draft', 'Registered', 'Submitted'
}
