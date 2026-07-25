"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  Video,
  Image,
  Mic,
  FileText,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";


type Inspection = {
  files: File[];
  status: "uploaded" | "analysing" | "complete";
};


export default function Home() {

  const router = useRouter();

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [complete, setComplete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);



  const {
    getRootProps,
    getInputProps,
    isDragActive

  } = useDropzone({

    accept: {
      "video/*": [],
      "image/*": [],
      "audio/*": []
    },


    onDrop: (acceptedFiles) => {

      const newInspection: Inspection = {

        files: acceptedFiles,

        status: "uploaded"

      };


      setInspection(newInspection);

      setComplete(false);

    }

  });




  async function analyseInspection() {

    if (!inspection) return;


    setAnalysing(true);

    setErrorMsg(null);



    setInspection({

      ...inspection,

      status: "analysing"

    });



    const formData = new FormData();
    inspection.files.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/main", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || data.error || !data.id?.length) {
        console.error("API error", data);
        setInspection({
          ...inspection,
          status: "complete",
        });
        setErrorMsg(
            data.error ?? "Unable to identify any parts from the uploaded files."
        );
        setAnalysing(false);
        setComplete(true);
        return;
      }

      // Hand the identified parts (id/name/image) off to the parts-selection
      // page rather than rendering them inline here.
      sessionStorage.setItem("partly:parts", JSON.stringify(data));
      router.push("/parts");
    } catch (error) {
      console.error("Upload failed", error);
      setInspection({
        ...inspection,
        status: "complete",
      });
      setErrorMsg("Upload failed. Please try again.");
      setAnalysing(false);
      setComplete(true);
    }

  }





  return (

      <main className="min-h-screen bg-slate-50 text-slate-900">


        <header className="border-b bg-white">

          <div className="mx-auto max-w-6xl px-8 py-6">


            <h1 className="text-3xl font-semibold text-slate-900">

              Repair Copilot

            </h1>


            <p className="mt-2 text-slate-600">

              Convert vehicle inspections into repair orders.

            </p>


          </div>

        </header>





        <div className="mx-auto max-w-6xl px-8 py-10">



          {/* Workflow */}


          <div className="mb-10 flex items-center gap-4">


            <Step
                number="1"
                text="Upload"
                active
            />


            <div className="h-px flex-1 bg-slate-200"/>


            <Step
                number="2"
                text="Analyse"
            />


            <div className="h-px flex-1 bg-slate-200"/>


            <Step
                number="3"
                text="Review"
            />


            <div className="h-px flex-1 bg-slate-200"/>


            <Step
                number="4"
                text="Repair Order"
            />


          </div>






          {/* Upload box */}


          <div

              {...getRootProps()}

              className={`
          cursor-pointer
          rounded-xl
          border-2
          border-dashed
          bg-white
          p-12
          transition

          ${
                  isDragActive
                      ?
                      "border-indigo-600 bg-indigo-50"
                      :
                      "border-slate-300 hover:border-indigo-500"
              }

          `}

          >


            <input {...getInputProps()} />


            <div className="flex flex-col items-center text-center">


              <div className="rounded-full bg-indigo-100 p-5">

                <Upload className="h-8 w-8 text-indigo-600"/>

              </div>



              <h2 className="mt-6 text-2xl font-semibold text-slate-900">

                Upload inspection files

              </h2>



              <p className="mt-2 max-w-md text-slate-600">

                Upload vehicle videos, photos, or technician voice notes.

                Repair Copilot will prepare the repair information automatically.

              </p>




              <button

                  type="button"

                  className="
              mt-6
              rounded-lg
              bg-indigo-600
              px-8
              py-3
              font-medium
              text-white
              hover:bg-indigo-700
              "

              >

                Choose Files

              </button>


            </div>


          </div>







          {/* File types */}


          <div className="mt-8 grid gap-4 md:grid-cols-3">


            <InfoCard

                icon={<Video/>}

                title="Inspection videos"

                description="Vehicle walkaround recordings"

            />


            <InfoCard

                icon={<Image/>}

                title="Vehicle photos"

                description="Damage and component images"

            />


            <InfoCard

                icon={<Mic/>}

                title="Voice notes"

                description="Natural technician observations"

            />


          </div>








          {/* Uploaded files */}



          {inspection && (


              <section className="mt-10 rounded-xl border bg-white p-8 shadow-sm">


                <h2 className="text-xl font-semibold text-slate-900">

                  Uploaded inspection

                </h2>



                <div className="mt-5 space-y-3">


                  {inspection.files.map((file)=>(


                      <div

                          key={file.name}

                          className="
                  flex
                  items-center
                  justify-between
                  rounded-lg
                  border
                  border-slate-200
                  p-4
                  "

                      >


                        <div className="flex items-center gap-3">


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

                    onClick={analyseInspection}

                    disabled={analysing}

                    className="
              mt-8
              w-full
              rounded-lg
              bg-indigo-600
              py-4
              font-semibold
              text-white
              hover:bg-indigo-700
              disabled:bg-indigo-300
              "

                >

                  {analysing
                      ?
                      "Analysing Inspection..."
                      :
                      "Analyse Inspection"
                  }


                </button>


              </section>


          )}









          {/* AI processing */}



          {analysing && (


              <section className="mt-8 rounded-xl border bg-white p-8 shadow-sm">


                <h2 className="text-xl font-semibold text-slate-900">

                  Preparing repair summary

                </h2>



                <div className="mt-6 space-y-4">


                  <Process text="Transcribing technician notes"/>

                  <Process text="Identifying vehicle configuration"/>

                  <Process text="Matching OEM replacement parts"/>

                  <Process text="Comparing supplier options"/>


                </div>


              </section>


          )}








          {/* Error */}



          {complete && errorMsg && (


              <section className="mt-8 rounded-xl border border-red-200 bg-red-50 p-8 shadow-sm">


                <div className="flex items-start gap-3">

                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />

                  <div>

                    <h2 className="text-lg font-semibold text-slate-900">

                      Couldn&apos;t prepare a repair summary

                    </h2>

                    <p className="mt-2 text-slate-700">

                      {errorMsg}

                    </p>

                  </div>

                </div>


                <button

                    onClick={() => {
                      setComplete(false);
                      setErrorMsg(null);
                    }}

                    className="
              mt-6
              rounded-lg
              bg-indigo-600
              px-8
              py-3
              font-semibold
              text-white
              hover:bg-indigo-700
              "

                >

                  Try again

                </button>

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
}) {


  return (

      <div className="flex items-center gap-2">


        <div

            className={`
        flex
        h-8
        w-8
        items-center
        justify-center
        rounded-full
        text-sm
        font-medium

        ${
                active
                    ?
                    "bg-indigo-600 text-white"
                    :
                    "bg-slate-200 text-slate-700"
            }

        `}

        >

          {number}

        </div>


        <span className="text-sm text-slate-700">

        {text}

      </span>


      </div>

  );

}







function InfoCard({
                    icon,
                    title,
                    description
                  }:{
  icon:React.ReactNode;
  title:string;
  description:string;
}) {


  return (

      <div className="rounded-xl border bg-white p-6 shadow-sm">


        <div className="mb-4 w-fit rounded-lg bg-indigo-100 p-3 text-indigo-600">

          {icon}

        </div>


        <h3 className="font-semibold text-slate-900">

          {title}

        </h3>


        <p className="mt-1 text-sm text-slate-600">

          {description}

        </p>


      </div>

  );

}






function Process({
                   text
                 }:{
  text:string;
}) {


  return (

      <div className="flex items-center gap-3 text-slate-700">


        <div className="h-2 w-2 animate-pulse rounded-full bg-indigo-600"/>


        <span>

        {text}

      </span>


      </div>

  );

}