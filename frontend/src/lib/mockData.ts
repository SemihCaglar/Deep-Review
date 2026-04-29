export interface User {
    id: string;
    name: string;
    isCoordinator: boolean;
    isAdmin?: boolean;
    isGlobalAdmin?: boolean;
    isLocalAdmin?: boolean;
    email: string;
    topics?: string[];
    labs?: { id: string; name: string }[];
}

export interface PaperEvent {
    id: string;
    date: string;
    message: string;
    actorId: string;
    type: 'StatusChange' | 'ReviewAction' | 'SystemAction';
}

export interface Paper {
    id: string;
    title: string;
    abstract: string;
    topics: string[];
    status: 'Draft' | 'In Review' | 'Review Done' | 'Accepted' | 'Rejected' | 'Archived';
    authors: string[];
    parentPapers?: string[];
    overleafLink?: string;
    history?: PaperEvent[];
}

export interface ReviewRound {
    id: string;
    paperId: string;
    roundNumber: number;
    deadline: string;
    status: 'Open' | 'Closed';
}

export interface ReviewRating {
    quantity: number; // 1-5
    quality: number; // 1-5
    timelines: number; // 1-5
}

export interface ReviewAssignment {
    id: string;
    roundId: string;
    reviewerId: string;
    status: 'Pending' | 'Accepted' | 'Declined' | 'Submitted';
    submittedAt?: string;
    declineReason?: string;
    rating?: ReviewRating;
}

// Global mock users
export const MOCK_USERS: Record<string, User> = {
    coordinator: {
        id: 'bb0e0041-483e-4df6-8827-67432baff9ff',
        name: 'Semih User',
        email: 'semih@builder.app',
        isCoordinator: true,
    },
    semih: {
        id: 'bb0e0041-483e-4df6-8827-67432baff9ff',
        name: 'Semih User',
        email: 'semih@builder.app',
        isCoordinator: true,
        topics: ['Microservices', 'Software Architecture', 'CI/CD'],
    },
    bob: {
        id: '76622de0-bca4-4d59-a05f-7890268b5822',
        name: 'Emily Chen',
        email: 'emily@builder.app',
        isCoordinator: false,
        topics: ['Code Smells', 'LLMs', 'Static Analysis'],
    }
};

export const MOCK_PAPERS: Paper[] = [
    {
        id: 'p1',
        title: 'An Empirical Study on Microservices Architecture Migration',
        abstract: 'Migrating to microservices is hard. This paper presents an empirical study...',
        topics: ['Microservices', 'Software Architecture'],
        status: 'In Review',
        authors: ['u2'], // Semih is an author
        overleafLink: 'https://v2.overleaf.com/read/abc123mock',
        history: [
            { id: 'h1', date: '2026-03-25T10:00:00Z', message: 'Paper registered by Coordinator', actorId: 'u1', type: 'SystemAction' },
            { id: 'h2', date: '2026-03-26T14:30:00Z', message: 'Round 1 initiated with deadline April 15, 2026', actorId: 'u1', type: 'StatusChange' },
            { id: 'h3', date: '2026-03-27T09:15:00Z', message: 'Bob Tüzün accepted the reviewing task', actorId: 'u3', type: 'ReviewAction' }
        ]
    },
    {
        id: 'p2',
        title: 'Detecting Code Smells using LLMs: A Comprehensive Evaluation',
        abstract: 'Large language models can be used to detect software code smells...',
        topics: ['Code Smells', 'LLMs'],
        status: 'Draft',
        authors: ['u2', 'u3'], // Semih and Bob
        history: [
            { id: 'h4', date: '2026-04-01T11:20:00Z', message: 'Paper registered by Coordinator', actorId: 'u1', type: 'SystemAction' }
        ]
    },
    {
        id: 'p3',
        title: 'Continuous Integration Bottlenecks in Open Source',
        abstract: 'CI workflows often bottleneck on slow tests...',
        topics: ['CI/CD', 'Testing'],
        status: 'Archived',
        authors: ['u1'], // Coordinator is an author here
        history: [
            { id: 'h5', date: '2026-02-10T08:00:00Z', message: 'Paper registered by Coordinator', actorId: 'u1', type: 'SystemAction' },
            { id: 'h6', date: '2026-02-20T16:00:00Z', message: 'Paper was archived manually', actorId: 'u1', type: 'SystemAction' }
        ]
    },
    {
        id: 'p4',
        title: 'Reviewer Assignment Optimization in Peer Review',
        abstract: 'Assigning reviewers to papers is a complex optimization problem...',
        topics: ['Software Architecture'],
        status: 'In Review',
        authors: ['u1'], // Coordinator is an author
        history: [
            { id: 'h7', date: '2026-03-28T09:00:00Z', message: 'Paper registered by Coordinator', actorId: 'u1', type: 'SystemAction' },
            { id: 'h8', date: '2026-03-29T10:00:00Z', message: 'Round 1 initiated with deadline May 1, 2026', actorId: 'u1', type: 'StatusChange' },
            { id: 'h9', date: '2026-03-30T11:00:00Z', message: 'Semih Tüzün declined the reviewing task. Reason: Conflict of interest.', actorId: 'u2', type: 'ReviewAction' }
        ]
    }
];

export const MOCK_ROUNDS: ReviewRound[] = [
    {
        id: 'r1',
        paperId: 'p1',
        roundNumber: 1,
        deadline: '2026-04-15',
        status: 'Open'
    },
    {
        id: 'r2',
        paperId: 'p4',
        roundNumber: 1,
        deadline: '2026-05-01',
        status: 'Open'
    }
];

export const MOCK_ASSIGNMENTS: ReviewAssignment[] = [
    {
        id: 'a1',
        roundId: 'r1',
        reviewerId: 'u3', // Bob is reviewing p1
        status: 'Accepted'
    },
    {
        id: 'a2',
        roundId: 'r2',
        reviewerId: 'u3', // Bob is pending on p4
        status: 'Pending'
    },
    {
        id: 'a3',
        roundId: 'r2',
        reviewerId: 'u2', // Semih declined p4
        status: 'Declined',
        declineReason: 'Conflict of interest.'
    }
];
