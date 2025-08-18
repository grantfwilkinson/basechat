"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

// Tabs removed to show only Files view
import WarningMessage from "@/components/warning-message";
import { getPricingPlansPath } from "@/lib/paths";
import ManageDataPreviewIcons from "@/public/manage-data-preview-icons.svg";

// Connections UI removed
import FileDropzone from "./file-dropzone";
import FilesTable from "./files-table";
import UploadFileButton from "./upload-file-button";

interface Props {
  tenant: {
    id: string;
    slug: string;
    partitionLimitExceededAt: Date | null;
    paidStatus: string;
  };
  session: {
    user: {
      name: string;
    };
  };
  initialFiles: any[];
  nextCursor: string | null;
  totalDocuments: number;
  connections: any[];
  connectionMap: Record<
    string,
    {
      sourceType: string;
      addedBy: string | null;
    }
  >;
  defaultPartitionLimit: number;
}

export default function DataPageClient({
  tenant,
  session,
  initialFiles,
  nextCursor,
  totalDocuments,
  connections,
  connectionMap,
  defaultPartitionLimit,
}: Props) {
  const [fileUploadCount, setFileUploadCount] = useState(0);

  const chatbotDisabled = tenant.paidStatus === "expired";

  return (
    <div className="max-w-[1140px] w-full p-4 flex flex-col h-full">
      <div className="flex w-full justify-between items-center pt-2">
        <h1 className="font-bold text-[32px] text-[#343A40]">Knowledge Base</h1>
        <div className="flex gap-2">
          <UploadFileButton
            tenant={tenant}
            userName={session.user.name}
            onUploadComplete={() => setFileUploadCount((prev) => prev + 1)}
            disabled={chatbotDisabled}
          />
        </div>
      </div>
      {!isNaN(defaultPartitionLimit) && tenant.partitionLimitExceededAt && (
        <WarningMessage className="mt-4">
          You have reached the page processing limit for this chatbot. Please{" "}
          <Link href={getPricingPlansPath(tenant.slug)} className={"underline"}>
            upgrade plans
          </Link>{" "}
          to continue or contact support@ragie.ai if you need assistance.
        </WarningMessage>
      )}
      <div className="flex flex-col h-full mt-8">
        <div className="flex-1 overflow-hidden">
          {initialFiles.length > 0 ? (
            <FilesTable
              tenant={tenant}
              initialFiles={initialFiles}
              nextCursor={nextCursor}
              initialTotalDocuments={totalDocuments}
              userName={session.user.name}
              connectionMap={connectionMap}
              fileUploadCount={fileUploadCount}
            />
          ) : (
            <div className="flex-grow w-full flex flex-col items-center justify-center h-[calc(100vh-400px)]">
              <FileDropzone
                tenant={tenant}
                userName={session.user.name}
                onUploadComplete={() => setFileUploadCount((prev) => prev + 1)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
