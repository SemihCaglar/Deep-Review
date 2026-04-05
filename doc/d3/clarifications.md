# System Clarifications & Assumptions Needed

To ensure the class diagram accurately reflects the system's exact business logic, please clarify the following points:

1. **Coordinator Entity vs. Role:**
   The context states `Author <|-- Coordinator` and "Coordinator is also an author of every paper". 
   - Should `Coordinator` be a distinct class extending `Author`, or would you prefer a boolean flag/role on a `User` entity linked to a `Paper` (e.g. `coordinatorId`)? I have created a `Coordinator` class extending `Author` for now. Is this correct?

   yes this is correct behav.

2. **Topics Entity Strategy:**
   The context mentions a "global topic list".
   - Should `Topic` be a standalone entity class that links to both `Paper` (via Many-to-Many) and `Reviewer` (via Many-to-Many)? I have modeled it this way.

   yes.

3. **Availability Schedule:**
   The context says Reviewers set an "availability schedule". 
   - What format does this take? I assume it is an array of `DateRange` objects (`{ startDate: Date, endDate: Date, isAvailable: boolean }`). Is this acceptable?

   yes for now but remember that choice. we can update it. ask this later again.

4. **Controllers Grouping Methodology:**
   I modeled the Controller classes out of the "packages" in your Use Case diagram (e.g., `AccountController`, `PaperRegistrationController`, `RoundManagementController`, `ReviewerResponseController`, `AIReviewController`, `RatingAnalyticsController`, `AdminController`). 
   - Does this logical MVC separation align with your expectations?

5. **Tool for Typescript to UML Converter:**
   As you requested, I researched tools to convert our Typescript prototypes directly into a UML Class Diagram. `tplant` is an excellent tool used precisely for creating PlantUML files out of Typescript source files. 
   - Would you like me to use `tplant` (executing `npx tplant` to run it)?

   yes use it. if it is not installed. give me instruction how can i install it.

Once confirmed, I can proceed with creating the final UML diagram.
