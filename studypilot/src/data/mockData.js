import {
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  ClipboardList,
  FileQuestion,
  FileText,
  FolderOpen,
  GraduationCap,
  Home,
  Layers,
  Library,
  NotebookTabs,
  Search,
  Sparkles,
  UploadCloud,
  UserRound,
  Youtube
} from "lucide-react";

export const navItems = [
  { label: "Dashboard", path: "/student/dashboard", icon: Home },
  { label: "PDF Study Converter", path: "/student/pdf-studio", icon: UploadCloud },
  { label: "Resource Hub", path: "/student/resource-hub", icon: Library },
  { label: "AI Advisor", path: "/student/ai-advisor", icon: Bot },
  { label: "Profile", path: "/student/profile", icon: UserRound }
];

export const adminNav = navItems;

export const heroChips = [
  { label: "PDF", icon: FileText, className: "left-6 top-14 xl:left-12 xl:top-20" },
  { label: "DOCX", icon: FileText, className: "left-4 top-[46%] xl:left-10" },
  { label: "QUIZ", icon: Brain, className: "left-10 bottom-16 xl:left-16" },
  { label: "NOTES", icon: NotebookTabs, className: "right-6 top-14 xl:right-12 xl:top-20" },
  { label: "POLICY", icon: BookOpen, className: "right-4 top-[46%] xl:right-10" },
  { label: "COURSE", icon: GraduationCap, className: "right-10 bottom-16 xl:right-16" },
  { label: "AI", icon: Sparkles, className: "left-[22%] top-8 xl:left-[25%]" },
  { label: "FLASHCARD", icon: Layers, className: "right-[22%] bottom-8 xl:right-[25%]" }
];

export const features = [
  {
    title: "AI Academic Advisor",
    icon: Bot,
    path: "/ai-advisor",
    description: "Ask academic questions and get clear guidance grounded in course and policy context."
  },
  {
    title: "PDF Study Converter",
    icon: FileText,
    path: "/pdf-studio",
    description: "Upload one PDF and generate flashcards, MCQs, and mixed quizzes from extracted text."
  },
  {
    title: "Resource Hub",
    icon: Library,
    path: "/resource-hub",
    description: "Discover videos, textbooks, and academic articles for your courses."
  },
  {
    title: "Academic Passport",
    icon: BarChart3,
    path: "/onboarding",
    description: "Capture your courses, goals, weak areas, and learning preferences for a more personalized workspace."
  },
  {
    title: "Student Success Support",
    icon: GraduationCap,
    path: "/dashboard",
    description: "Keep recent activity, study outputs, and progress organized in one workspace."
  }
];

export const howItWorks = [
  {
    title: "Upload Academic Materials",
    icon: UploadCloud,
    description: "Students add PDFs, course outlines, notes, and revision materials."
  },
  {
    title: "Ask, Generate, And Explore",
    icon: Search,
    description: "StudyPilot answers questions, creates quizzes, builds flashcards, and finds resources."
  },
  {
    title: "Study Smarter",
    icon: Sparkles,
    description: "Students save useful outputs and continue learning from one organized workspace."
  }
];

export const overviewCards = [
  { label: "Active Courses", value: "6", icon: GraduationCap },
  { label: "Resource Results", value: "24", icon: FolderOpen },
  { label: "PDF Documents", value: "12", icon: FileText },
  { label: "Generated Outputs", value: "18", icon: ClipboardList }
];

export const adminStats = [
  { label: "Students", value: "1,248", icon: GraduationCap },
  { label: "Courses", value: "42", icon: BookOpen },
  { label: "Documents", value: "96", icon: FileText },
  { label: "Resources", value: "318", icon: Library }
];

export const courses = [
  { code: "CSC 310", title: "Database Systems", department: "Computer Science", level: "300", description: "Relational models, SQL, normalization, and transactions." },
  { code: "CSC 415", title: "Compiler Construction", department: "Computer Science", level: "400", description: "Lexical analysis, parsing, syntax trees, and code generation." },
  { code: "CSC 322", title: "Operating Systems", department: "Computer Science", level: "300", description: "Processes, scheduling, memory, filesystems, and synchronization." }
];

export const actionCards = [
  { title: "PDF Study Converter", text: "Upload a PDF and generate flashcards, MCQs, or mixed quizzes.", icon: UploadCloud, path: "/student/pdf-studio" },
  { title: "AI Advisor", text: "Ask questions about courses, policies, and study plans.", icon: Bot, path: "/student/ai-advisor" },
  { title: "Resource Hub", text: "Find study materials for your courses.", icon: Library, path: "/student/resource-hub" }
];

export const recentActivity = [
  "Asked AI Advisor about database normalization",
  "Generated flashcards from compiler construction notes",
  "Opened an operating systems resource",
  "Completed Database Systems quiz"
];

export const suggestedQuestions = [
  "What courses should I focus on this week?",
  "Explain this academic policy.",
  "Recommend resources for CSC 310.",
  "Generate a study plan from my PDF."
];

export const documents = [
  { name: "Compiler Notes.pdf", title: "Compiler Notes", type: "PDF", department: "Computer Science", status: "Active", date: "May 13, 2026" },
  { name: "Database Systems Outline.docx", title: "Database Systems Outline", type: "DOCX", department: "Computer Science", status: "Active", date: "May 10, 2026" },
  { name: "Academic Policy.pdf", title: "Academic Policy", type: "PDF", department: "General", status: "Active", date: "May 02, 2026" }
];

export const flashcards = [
  { deck: "Data Structures", cards: 120, updated: "Today", question: "What is a stack?", answer: "A stack is a linear structure that follows last in, first out ordering." },
  { deck: "Database Systems", cards: 85, updated: "Yesterday", question: "What is normalization?", answer: "Normalization organizes database tables to reduce redundancy and improve integrity." },
  { deck: "Operating Systems", cards: 64, updated: "2 days ago", question: "What is a process?", answer: "A process is a program in execution with its own state and resources." },
  { deck: "Computer Networks", cards: 72, updated: "5 days ago", question: "What is TCP?", answer: "TCP is a reliable transport protocol that manages ordered data delivery." },
  { deck: "Compiler Construction", cards: 96, updated: "This week", question: "What is lexical analysis?", answer: "Lexical analysis converts source code characters into meaningful tokens for the parser." }
];

export const quizzes = [
  {
    title: "Database Systems Quiz",
    course: "Database Systems",
    question: "Which SQL clause groups rows with the same values?",
    options: ["ORDER BY", "GROUP BY", "WHERE", "INSERT"],
    answer: "GROUP BY",
    explanation: "GROUP BY is used with aggregate functions to group matching rows."
  },
  {
    title: "Compiler Quiz",
    course: "Compiler Construction",
    question: "Which phase converts source code into tokens?",
    options: ["Parsing", "Lexical analysis", "Optimization", "Linking"],
    answer: "Lexical analysis",
    explanation: "Lexical analysis scans characters and produces tokens for the parser."
  }
];

export const resources = [
  { title: "Database Normalization Tutorial", type: "YouTube", topic: "Normalization", course: "CSC 310", difficulty: "Beginner", icon: Youtube, description: "A friendly video guide to normal forms and schema design." },
  { title: "Database Systems Textbook", type: "Textbook", topic: "Relational Design", course: "CSC 310", difficulty: "Intermediate", icon: BookOpen, description: "A textbook recommendation for relational design and SQL foundations." },
  { title: "Compiler Design Notes", type: "PDF", topic: "Parsing", course: "CSC 415", difficulty: "Intermediate", icon: FileText, description: "Clear PDF notes on lexical analysis and parsing." },
  { title: "Operating Systems Guide", type: "Article", topic: "Processes", course: "CSC 322", difficulty: "Beginner", icon: FileQuestion, description: "Process management explained with examples and revision prompts." }
];

export const users = [
  { name: "Faith Abiodun", email: "faith@student.edu", role: "Student", joined: "May 01, 2026", status: "Active" },
  { name: "Maya Chen", email: "maya@student.edu", role: "Student", joined: "May 04, 2026", status: "Active" }
];

export const systemFlow = [
  { label: "React frontend", icon: Layers },
  { label: "Django REST API", icon: Layers },
  { label: "PostgreSQL data", icon: FolderOpen },
  { label: "AI retrieval", icon: Sparkles },
  { label: "Student output", icon: GraduationCap }
];

export const savedLibrary = [
  { title: "Database Normalization Tutorial", type: "Resource", saved: "May 20, 2026" },
  { title: "Compiler Construction Flashcards", type: "Flashcards", saved: "May 18, 2026" },
  { title: "Operating Systems Quiz", type: "Quiz", saved: "May 16, 2026" },
  { title: "Course Registration Advice", type: "AI Response", saved: "May 12, 2026" }
];
