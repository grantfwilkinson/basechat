"use client";

import { formatDistanceToNow } from "date-fns";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import Dropzone from "react-dropzone";
import { toast } from "sonner";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
// Connection column removed
import { MAX_FILE_SIZE, getDropzoneAcceptConfig, uploadFile, validateFile } from "@/lib/file-utils";
import { getStatusDisplayName } from "@/lib/utils";

import ManageFileMenu from "./manage-file-menu";

interface Props {
  tenant: {
    id: string;
    slug: string;
    paidStatus: string;
  };
  initialFiles: any[];
  nextCursor: string | null;
  userName: string;
  connectionMap: Record<
    string,
    {
      sourceType: string;
      addedBy: string | null;
    }
  >;
  initialTotalDocuments: number;
  fileUploadCount: number;
}

export default function FilesTable({
  tenant,
  initialFiles,
  nextCursor,
  userName,
  connectionMap,
  initialTotalDocuments,
  fileUploadCount: externalFileUploadCount = 0,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [allFiles, setAllFiles] = useState(initialFiles);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [totalDocuments, setTotalDocuments] = useState(initialTotalDocuments);
  const [internalFileUploadCount, setInternalFileUploadCount] = useState(0);
  const currentCursor = searchParams.get("cursor") || null;
  const historyParam = searchParams.get("history") || "";
  const cursorHistory = historyParam ? historyParam.split(",") : [];

  // Combine external and internal file upload counts
  const totalFileUploadCount = externalFileUploadCount + internalFileUploadCount;

  // update the table if a file has been deleted
  const handleFileRemoved = (fileId: string) => {
    setAllFiles((prev) => {
      const index = prev.findIndex((file) => file.id === fileId);
      if (index === -1) return prev; // File not found
      const newFiles = [...prev];
      newFiles.splice(index, 1);
      return newFiles;
    });
    setTotalDocuments((prev) => prev - 1);
  };

  const fetchFiles = async (cursor: string | null) => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const response = await fetch(`/api/tenants/current/documents?cursor=${cursor ?? ""}`, {
        headers: { tenant: tenant.slug },
      });
      const data = await response.json();

      if (data.documents) {
        setAllFiles(data.documents);
      }

      if (data.totalCount) {
        setTotalDocuments(data.totalCount);
      }
    } catch (error) {
      console.error("Error loading files:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch files when cursor changes
  useEffect(() => {
    fetchFiles(currentCursor);
  }, [currentCursor]);

  // Initial fetch when component mounts to respect URL cursor
  useEffect(() => {
    if (currentCursor) {
      fetchFiles(currentCursor);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally run once
  }, []);

  // Poll for file status updates
  useEffect(() => {
    const checkFilesStatus = async () => {
      try {
        const response = await fetch("/api/tenants/current/documents", {
          headers: { tenant: tenant.slug },
        });
        const data = await response.json();

        if (data.documents) {
          // Only update the status of existing files
          setAllFiles((prev) =>
            prev.map((file) => {
              const updatedFile = data.documents.find((d: any) => d.id === file.id);
              return updatedFile || file;
            }),
          );

          // Check if any files are still processing
          const hasProcessingFiles = data.documents.some(
            (file: any) => file.status !== "ready" && file.status !== "failed",
          );

          // If no more processing files, clear the interval
          if (!hasProcessingFiles && intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (error) {
        console.error("Error fetching documents:", error);
      }
    };

    // Initial check for processing files
    const hasProcessingFiles = initialFiles.some((file) => file.status !== "ready" && file.status !== "failed");

    // Set up polling if needed
    if (hasProcessingFiles) {
      intervalRef.current = setInterval(checkFilesStatus, 5000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [initialFiles, tenant.slug]);

  // Add this new useEffect to re-fetch files when fileUploadCount changes
  useEffect(() => {
    if (totalFileUploadCount > 0) {
      fetchFiles(null);
    }
  }, [totalFileUploadCount]);

  const handleNavigation = (cursor: string | null) => {
    if (cursor === null) {
      // Going back to first page
      router.push("?cursor=");
    } else {
      // Going forward
      const newHistory = [...cursorHistory, currentCursor || ""].filter(Boolean);
      router.push(`?cursor=${cursor}&history=${newHistory.join(",")}`);
    }
  };

  const handlePreviousPage = () => {
    if (cursorHistory.length === 0) {
      // If no history, go to first page
      router.push("?cursor=");
    } else {
      // Get the last cursor from history
      const previousCursor = cursorHistory[cursorHistory.length - 1];
      const newHistory = cursorHistory.slice(0, -1);
      router.push(`?cursor=${previousCursor}${newHistory.length ? `&history=${newHistory.join(",")}` : ""}`);
    }
  };

  return (
    <Dropzone
      onDrop={async (acceptedFiles: File[]) => {
        if (tenant.paidStatus === "expired") {
          toast.error("Your organization's subscription has expired. Please renew to continue using this chatbot.");
          return;
        }
        const uploadPromises = acceptedFiles.map(async (file) => {
          const validation = validateFile(file);
          if (!validation.isValid) {
            toast.error(validation.error);
            return;
          }
          const toastId = toast.loading(`Uploading ${file.name}...`);

          try {
            await uploadFile(file, tenant.slug, userName);
            toast.success(`Successfully uploaded ${file.name}`, {
              id: toastId,
            });
          } catch (err) {
            toast.error(`Failed to upload ${file.name}`, {
              id: toastId,
            });
          }
        });

        await Promise.all(uploadPromises);
        router.refresh();
        // Trigger a re-fetch by incrementing internal file upload count
        setInternalFileUploadCount((prev) => prev + 1);
      }}
      accept={getDropzoneAcceptConfig()}
      maxSize={MAX_FILE_SIZE}
      onDragEnter={() => setIsDragActive(true)}
      onDragLeave={() => setIsDragActive(false)}
      onDropAccepted={() => setIsDragActive(false)}
      onDropRejected={() => setIsDragActive(false)}
      noClick
    >
      {({ getRootProps, getInputProps }) => (
        <div className="h-full w-full flex flex-col" {...getRootProps()}>
          <input {...getInputProps()} />
          <hr className="my-4" />
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-gray-500">
              {totalDocuments.toLocaleString()} {totalDocuments === 1 ? "file" : "files"}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePreviousPage}
                disabled={!currentCursor && cursorHistory.length === 0}
                className={`p-1 rounded-md flex items-center gap-1 ${!currentCursor && cursorHistory.length === 0 ? "text-gray-400 cursor-not-allowed" : "text-gray-600 hover:bg-gray-100"}`}
              >
                <ChevronLeft className="h-5 w-5" />
                <span className="text-sm">Previous 50</span>
              </button>
              <button
                onClick={() => handleNavigation(nextCursor)}
                disabled={!nextCursor}
                className={`p-1 rounded-md flex items-center gap-1 ${!nextCursor ? "text-gray-400 cursor-not-allowed" : "text-gray-600 hover:bg-gray-100"}`}
              >
                <span className="text-sm">Next 50</span>
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div
            className={`flex-1 overflow-y-auto relative ${isDragActive ? "after:content-[''] after:absolute after:inset-0 after:bg-[#F0F7FF] after:border-2 after:border-[#007AFF] after:border-dashed after:rounded-lg after:pointer-events-none" : ""}`}
          >
            {isLoading ? (
              <div className="h-full w-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#006EDB]" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow noHover>
                    <TableHead className="w-[600px] pl-0">Name</TableHead>
                    <TableHead className="w-[200px]">Added by</TableHead>
                    <TableHead className="w-[200px]">Date added</TableHead>
                    <TableHead className="w-[200px]">Date modified</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allFiles.map((file) => (
                    <TableRow key={file.id} noHover>
                      <TableCell className="font-medium">{file.name}</TableCell>

                      <TableCell>
                        {file.metadata?.source_type && file.metadata.source_type !== "manual" ? (
                          <div>{connectionMap[file.metadata.source_type]?.addedBy || "-"}</div>
                        ) : (
                          file.metadata.added_by || "-"
                        )}
                      </TableCell>
                      <TableCell>{formatDistanceToNow(new Date(file.createdAt), { addSuffix: true })}</TableCell>
                      <TableCell>{formatDistanceToNow(new Date(file.updatedAt), { addSuffix: true })}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {file.status !== "ready" && file.status !== "failed" && (
                            <Loader2 className="h-4 w-4 animate-spin text-[#006EDB]" />
                          )}
                          {tenant.paidStatus === "expired" ? "Paused" : getStatusDisplayName(file.status)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <ManageFileMenu
                          id={file.id}
                          tenant={tenant}
                          isConnectorFile={file.metadata?.source_type && file.metadata.source_type !== "manual"}
                          onFileRemoved={handleFileRemoved}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      )}
    </Dropzone>
  );
}
