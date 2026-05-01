export interface RegisterPaperDto {
    title: string;
    abstractText: string;
    topics: string[]; // UUIDs of the topics
    authors?: string[]; // Array of User UUIDs who are authors
    overleafLink?: string;
    githubLink?: string;
    parentPaperIds?: string[]; // IDs of any parent papers
}

export interface UpdatePaperDto {
    title?: string;
    abstractText?: string;
    topics?: string[];
    overleafLink?: string;
    githubLink?: string;
    status?: string;
}
