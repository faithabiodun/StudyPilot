import { Bookmark, BookmarkCheck, BookOpen, ExternalLink, FileText, Search, Youtube } from "lucide-react";
import { useMemo, useState } from "react";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import PageHeader from "../../components/layout/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { getResourceRecommendations, saveResource, trackResourceOpen } from "../../services/resourceService";
import { getCourseCode, getCourseLabel, getCourses } from "../../utils/user";

const filters = [
  { label: "YouTube", value: "youtube" },
  { label: "Textbooks", value: "textbooks" },
  { label: "Articles", value: "articles" }
];

const resourceIcons = {
  youtube: Youtube,
  textbook: BookOpen,
  article: FileText
};

const loadingLabels = {
  all: "Searching resources...",
  youtube: "Finding YouTube tutorials...",
  textbooks: "Finding textbooks...",
  articles: "Finding articles..."
};

function typeLabel(type) {
  if (type === "youtube") return "YouTube";
  if (type === "textbook") return "Textbook";
  return "Article";
}

function openLabel(type) {
  if (type === "youtube") return "Open Video";
  if (type === "textbook") return "Open Book";
  return "Open Article";
}

export default function ResourceHubPage() {
  const { user } = useAuth();
  const courses = getCourses(user);
  const suggestions = useMemo(() => {
    const courseLabels = courses.map(getCourseLabel).filter(Boolean);
    const weak = Array.isArray(user?.weak_courses) ? user.weak_courses : [];
    return [...new Set([...courseLabels, ...weak, "Compiler Construction", "Database normalization", "Software engineering models", "Operating systems process scheduling"])].slice(0, 6);
  }, [courses, user]);

  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [filter, setFilter] = useState("youtube");
  const [results, setResults] = useState([]);
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = async (nextFilter = filter, nextQuery = query) => {
    const trimmed = nextQuery.trim();
    if (!trimmed) {
      setError("Enter a course, topic, or resource query to search.");
      return;
    }
    setError("");
    setLoading(true);
    setSearchedQuery(trimmed);
    try {
      const response = await getResourceRecommendations({ query: trimmed, type: nextFilter });
      setResults(response.data?.results || []);
    } catch (searchError) {
      setResults([]);
      setError(searchError.message || "Could not fetch resources right now. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const selectFilter = (value) => {
    setFilter(value);
    if (searchedQuery || query.trim()) {
      search(value, query.trim() || searchedQuery);
    }
  };

  const selectSuggestion = (value) => {
    setQuery(value);
    search(filter, value);
  };

  const openResource = async (resource) => {
    if (!resource?.url) return;
    window.open(resource.url, "_blank", "noopener,noreferrer");
    trackResourceOpen({
        title: resource.title,
        resource_type: resource.resource_type,
        url: resource.url,
        source_name: resource.source_name
      }).catch(() => {});
  };

  const save = async (resource) => {
    try {
      await saveResource({
        title: resource.title,
        resource_type: resource.resource_type,
        description: resource.description,
        url: resource.url,
        source_name: resource.source_name,
        author_or_channel: resource.author_or_channel,
        published_date: resource.published_date,
        thumbnail: resource.thumbnail || ""
      });
      setSaved((current) => [...new Set([...current, resource.url])]);
    } catch (saveError) {
      setError(saveError.message || "Could not save this resource right now.");
    }
  };

  return (
    <div>
      <PageHeader title="Resource Hub" subtitle="Find learning resources tailored to your Academic Passport and search topic." />

      <div className="rounded-[1.75rem] border border-pilot-line bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-pilot-muted" size={18} />
            <Input
              placeholder="Search for a course, topic, or resource..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") search();
              }}
              className="pl-11"
            />
          </div>
          <Button icon={Search} onClick={() => search()} disabled={loading}>
            {loading ? loadingLabels[filter] : "Search"}
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {filters.map((item) => (
            <button key={item.value} onClick={() => selectFilter(item.value)} className={`rounded-full border px-4 py-2 text-sm font-bold transition ${filter === item.value ? "border-pilot-blue bg-pilot-blue text-white" : "border-pilot-line bg-white text-pilot-muted hover:border-pilot-blue hover:text-pilot-blue"}`}>
              {item.label}
            </button>
          ))}
        </div>

        {!searchedQuery && (
          <div className="mt-5 rounded-2xl bg-pilot-ice p-4">
            <p className="text-sm font-black text-pilot-ink">Recommended from your Academic Passport</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((item) => (
                <button key={item} onClick={() => selectSuggestion(item)} className="rounded-full border border-pilot-line bg-white px-3 py-1.5 text-xs font-black text-pilot-muted transition hover:border-pilot-blue hover:text-pilot-blue">
                  {getCourseCode(item) || item}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && <p className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
      {loading && <p className="mt-5 rounded-2xl border border-blue-100 bg-pilot-soft px-4 py-3 text-sm font-bold text-pilot-blue">{loadingLabels[filter]}</p>}

      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {!loading && results.map((resource) => {
          const Icon = resourceIcons[resource.resource_type] || FileText;
          const isSaved = saved.includes(resource.url);
          return (
            <article key={`${resource.resource_type}-${resource.url}-${resource.title}`} className="rounded-[1.75rem] border border-pilot-line bg-white p-5 shadow-soft transition hover:-translate-y-1 hover:border-pilot-blue hover:shadow-pilot">
              {resource.thumbnail && (
                <button onClick={() => openResource(resource)} className="mb-4 block aspect-video w-full overflow-hidden rounded-2xl border border-pilot-line bg-pilot-soft text-left">
                  <img src={resource.thumbnail} alt="" className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]" />
                </button>
              )}
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-pilot-soft text-pilot-blue">
                  <Icon size={23} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-pilot-blue">{typeLabel(resource.resource_type)}</p>
                  <h3 className="mt-1 text-lg font-black leading-6 text-pilot-ink">{resource.title}</h3>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-pilot-muted">{resource.description || "Useful learning resource related to your search."}</p>
              <div className="mt-4 space-y-1 text-xs font-bold text-pilot-muted">
                <p>Source: {resource.source_name || typeLabel(resource.resource_type)}</p>
                {resource.author_or_channel && <p>Author/Channel: {resource.author_or_channel}</p>}
                {resource.published_date && <p>Published: {resource.published_date}</p>}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button className="px-3 py-2 text-xs" icon={ExternalLink} onClick={() => openResource(resource)}>{openLabel(resource.resource_type)}</Button>
                <Button variant={isSaved ? "primary" : "secondary"} className="px-3 py-2 text-xs" icon={isSaved ? BookmarkCheck : Bookmark} onClick={() => save(resource)}>
                  {isSaved ? "Saved" : "Save"}
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      {!loading && searchedQuery && !results.length && !error && (
        <div className="mt-6 rounded-2xl border border-dashed border-pilot-line bg-pilot-sky p-8 text-center text-sm font-bold text-pilot-muted">
          No resources found for this search. Try a broader topic.
        </div>
      )}
    </div>
  );
}
