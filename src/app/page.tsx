"use client";

import { useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  Video,
  Image,
  Mic,
  FileText,
  CheckCircle,
} from "lucide-react";

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [analysing, setAnalysing] = useState(false);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "video/*": [],
      "image/*": [],
      "audio/*": [],
    },
    onDrop: (acceptedFiles) => {
      setFiles((prev) => [...prev, ...acceptedFiles]);
    },
  });

  return (
    <main className="min-h-screen bg-slate-50">


      <div className="mx-auto max-w-6xl px-8 py-10">


        {/* Workflow */}
        <div className="mb-10 flex items-center gap-4">

          <Step number="1" text="Upload" active />

          <div className="h-px flex-1 bg-slate-200" />

          <Step number="2" text="Analyse" />

          <div className="h-px flex-1 bg-slate-200" />

          <Step number="3" text="Review" />

          <div className="h-px flex-1 bg-slate-200" />

          <Step number="4" text="Repair Order" />

        </div>



        {/* Upload */}
        <div
          {...getRootProps()}
          className={`
          rounded-xl border-2 border-dashed bg-white p-12
          transition
          ${
            isDragActive
              ? "border-blue-500 bg-blue-50"
              : "border-slate-300 hover:border-blue-400"
          }
          `}
        >

          <input {...getInputProps()} />


          <div className="flex flex-col items-center text-center">


            <div className="rounded-full bg-blue-100 p-5">
              <Upload className="h-8 w-8 text-blue-600"/>
            </div>


            <h2 className="mt-6 text-2xl font-semibold text-slate-900">
              Upload inspection files
            </h2>


            <p className="mt-2 max-w-md text-slate-500">
              Add your inspection video, photos, or voice notes.
              Repair Copilot will prepare the repair details automatically.
            </p>


            <button
              type="button"
              className="
              mt-6 rounded-lg
              bg-blue-600
              px-8 py-3
              font-medium
              text-white
              hover:bg-blue-700
              "
            >
              Choose Files
            </button>


          </div>

        </div>



        {/* Supported files */}
        <div className="mt-8 grid gap-4 md:grid-cols-3">


          <InfoCard
            icon={<Video />}
            title="Inspection videos"
            description="Walkaround vehicle inspections"
          />


          <InfoCard
            icon={<Image />}
            title="Vehicle photos"
            description="Damage and component images"
          />


          <InfoCard
            icon={<Mic />}
            title="Voice notes"
            description="Natural repair observations"
          />


        </div>



        {/* Files */}
        {files.length > 0 && (

          <section className="mt-10 rounded-xl border bg-white p-8">

            <h2 className="text-xl font-semibold text-slate-900">
              Uploaded files
            </h2>


            <div className="mt-5 space-y-3">

              {files.map((file)=>(

                <div
                  key={file.name}
                  className="
                  flex items-center justify-between
                  rounded-lg
                  border
                  p-4
                  "
                >

                  <div className="flex items-center gap-4">

                    <FileText className="text-slate-400"/>

                    <div>

                      <p className="font-medium text-slate-900">
                        {file.name}
                      </p>

                      <p className="text-sm text-slate-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>

                    </div>

                  </div>


                  <CheckCircle className="text-green-500"/>


                </div>

              ))}

            </div>



            <button
              onClick={()=>setAnalysing(true)}
              className="
              mt-8
              w-full
              rounded-lg
              bg-blue-600
              py-4
              font-semibold
              text-white
              hover:bg-blue-700
              "
            >
              Analyse Inspection
            </button>


          </section>

        )}



        {/* Processing */}
        {analysing && (

          <section className="mt-8 rounded-xl border bg-white p-8">

            <h2 className="text-xl font-semibold">
              Preparing repair summary
            </h2>


            <div className="mt-6 space-y-4">

              <Process text="Uploading inspection files"/>
              <Process text="Transcribing repair notes"/>
              <Process text="Identifying vehicle details"/>
              <Process text="Matching replacement parts"/>
              <Process text="Finding supplier options"/>

            </div>


          </section>

        )}


      </div>

    </main>
  );
}



function Step({
  number,
  text,
  active
}:{
  number:string;
  text:string;
  active?:boolean;
}){

return (

<div className="flex items-center gap-2">

<div
className={`
flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium
${
active
? "bg-blue-600 text-white"
: "bg-slate-200 text-slate-600"
}
`}
>
{number}
</div>

<span className="text-sm text-slate-700">
{text}
</span>

</div>

)

}



function InfoCard({
icon,
title,
description
}:{
icon:React.ReactNode;
title:string;
description:string;
}){

return (

<div className="rounded-xl border bg-white p-6">

<div className="mb-4 w-fit rounded-lg bg-blue-100 p-3 text-blue-600">
{icon}
</div>

<h3 className="font-semibold text-slate-900">
{title}
</h3>

<p className="mt-1 text-sm text-slate-500">
{description}
</p>

</div>

)

}



function Process({
text
}:{
text:string
}){

return (

<div className="flex items-center gap-3 text-slate-700">

<div className="h-2 w-2 animate-pulse rounded-full bg-blue-600"/>

{text}

</div>

)

}