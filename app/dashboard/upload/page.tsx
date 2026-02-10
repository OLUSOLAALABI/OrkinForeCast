"use client"

import React from "react"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, Download, Info } from "lucide-react"
import * as XLSX from "xlsx"

type Branch = {
  id: string
  name: string
  region_id: string
  regions?: { name: string } | null
}

type Profile = {
  role: string
  branch_id: string | null
  region_id: string | null
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [uploadType, setUploadType] = useState<string>("actuals")
  const [year, setYear] = useState<string>("2025")
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>("")
  const [profile, setProfile] = useState<Profile | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profileData } = await supabase
        .from("profiles")
        .select("role, branch_id, region_id")
        .eq("id", user.id)
        .single()

      if (profileData) {
        setProfile(profileData)
        
        if (profileData.role === "branch_user" && profileData.branch_id) {
          setSelectedBranch(profileData.branch_id)
        } else {
          const { data: branchData } = await supabase
            .from("branches")
            .select("*, regions(name)")
            .order("name")
          if (branchData) setBranches(branchData)
        }
      }
    }
    fetchData()
  }, [supabase])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile.name.endsWith(".xlsx") || droppedFile.name.endsWith(".xls")) {
        setFile(droppedFile)
        setError(null)
      } else {
        setError("Please upload an Excel file (.xlsx or .xls)")
      }
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]
      if (selectedFile.name.endsWith(".xlsx") || selectedFile.name.endsWith(".xls")) {
        setFile(selectedFile)
        setError(null)
      } else {
        setError("Please upload an Excel file (.xlsx or .xls)")
      }
    }
  }

  const downloadTemplate = () => {
    const header = ["Description", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const row1 = ["Revenue", 10000, 11000, 10500, 12000, 11500, 13000, 12500, 14000, 13500, 15000, 14500, 16000]
    const row2 = ["Cost of Sales", 4000, 4400, 4200, 4800, 4600, 5200, 5000, 5600, 5400, 6000, 5800, 6400]
    const ws = XLSX.utils.aoa_to_sheet([header, row1, row2])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Data")
    XLSX.writeFile(wb, "orkin_upload_template.xlsx")
  }

  const processExcelFile = async (file: File): Promise<{description: string, month: number, value: number}[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = e.target?.result
          const workbook = XLSX.read(data, { type: "binary" })
          const sheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[sheetName]
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][]

          const results: {description: string, month: number, value: number}[] = []
          const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

          // Skip header row and process data
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i] as (string | number)[]
            if (!row || !row[0]) continue

            const description = String(row[0])
            
            // Assuming columns 1-12 are Jan-Dec
            for (let m = 0; m < 12; m++) {
              const value = row[m + 1]
              if (value !== undefined && value !== null && value !== "") {
                results.push({
                  description,
                  month: m + 1,
                  value: typeof value === "number" ? value : parseFloat(String(value)) || 0
                })
              }
            }
          }

          resolve(results)
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = reject
      reader.readAsBinaryString(file)
    })
  }

  const handleUpload = async () => {
    if (!file || !selectedBranch) {
      setError("Please select a file and branch")
      return
    }

    setUploading(true)
    setProgress(0)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      setProgress(20)

      // Process Excel file
      const extractedData = await processExcelFile(file)
      setProgress(40)

      // Create upload record
      const { data: uploadRecord, error: uploadError } = await supabase
        .from("uploads")
        .insert({
          user_id: user.id,
          branch_id: selectedBranch,
          file_name: file.name,
          file_path: `uploads/${selectedBranch}/${Date.now()}_${file.name}`,
          year: parseInt(year),
          upload_type: uploadType,
        })
        .select()
        .single()

      if (uploadError) throw uploadError
      setProgress(60)

      // Insert actuals data
      const actualsData = extractedData.map(item => ({
        upload_id: uploadRecord.id,
        branch_id: selectedBranch,
        description: item.description,
        year: parseInt(year),
        month: item.month,
        value: item.value,
      }))

      // Insert in batches
      const batchSize = 100
      for (let i = 0; i < actualsData.length; i += batchSize) {
        const batch = actualsData.slice(i, i + batchSize)
        const { error: insertError } = await supabase
          .from("actuals")
          .upsert(batch, { 
            onConflict: "branch_id,description,year,month",
            ignoreDuplicates: false 
          })
        
        if (insertError) throw insertError
        setProgress(60 + Math.floor((i / actualsData.length) * 30))
      }

      setProgress(100)
      setSuccess(true)
      
      setTimeout(() => {
        router.push("/dashboard/forecast")
      }, 2000)

    } catch (err) {
      console.error("Upload error:", err)
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Upload Data</h1>
        <p className="text-muted-foreground mt-1">
          Upload your Excel files containing actuals or budget data
        </p>
      </div>

      {success ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-16 w-16 text-accent mb-4" />
            <h2 className="text-xl font-semibold">Upload Successful!</h2>
            <p className="text-muted-foreground mt-2">
              Your data has been processed. Redirecting to forecasts...
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Upload Settings</CardTitle>
              <CardDescription>Configure your upload parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Upload Type</Label>
                  <Select value={uploadType} onValueChange={setUploadType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="actuals">Actuals Data</SelectItem>
                      <SelectItem value="budget">Budget Data</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Select value={year} onValueChange={setYear}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2024">2024</SelectItem>
                      <SelectItem value="2025">2025</SelectItem>
                      <SelectItem value="2026">2026</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {profile?.role !== "branch_user" && branches.length > 0 && (
                <div className="space-y-2">
                  <Label>Branch</Label>
                  <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const byRegion = new Map<string, Branch[]>()
                        branches.forEach((b) => {
                          const regionName = b.regions?.name ?? "Other"
                          if (!byRegion.has(regionName)) byRegion.set(regionName, [])
                          byRegion.get(regionName)!.push(b)
                        })
                        const sortedRegions = [...byRegion.keys()].sort()
                        return sortedRegions.map((regionName) => (
                          <SelectGroup key={regionName}>
                            <SelectLabel>{regionName}</SelectLabel>
                            {byRegion.get(regionName)!.map((branch) => (
                              <SelectItem key={branch.id} value={branch.id}>
                                {branch.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))
                      })()}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Required Excel format</CardTitle>
              <CardDescription>
                Column A = line item name (Description). Columns B–M = Jan through Dec (numeric values). Row 1 = header.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="font-medium flex items-center gap-2 mb-1">
                  <Info className="h-4 w-4" />
                  Standardized format
                </p>
                <p className="text-muted-foreground mb-2">
                  Use the same format for accurate forecasting: upload actuals for last year and current year, and budget when available. Keep description names identical across files.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download template (.xlsx)
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upload File</CardTitle>
              <CardDescription>
                Upload an Excel file (.xlsx or .xls) matching the format above
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                {file ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileSpreadsheet className="h-12 w-12 text-accent" />
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFile(null)}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-12 w-12 text-muted-foreground" />
                    <p className="font-medium">Drop your Excel file here</p>
                    <p className="text-sm text-muted-foreground">
                      or click to browse
                    </p>
                    <Input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileChange}
                      className="hidden"
                      id="file-upload"
                    />
                    <Label htmlFor="file-upload" className="cursor-pointer">
                      <Button variant="outline" asChild>
                        <span>Browse Files</span>
                      </Button>
                    </Label>
                  </div>
                )}
              </div>

              {uploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Processing...</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                onClick={handleUpload}
                disabled={!file || !selectedBranch || uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload and Process
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Expected File Format</CardTitle>
              <CardDescription>
                Your Excel file should follow this structure
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Description</th>
                      <th className="text-right p-2 font-medium">Jan</th>
                      <th className="text-right p-2 font-medium">Feb</th>
                      <th className="text-right p-2 font-medium">Mar</th>
                      <th className="text-right p-2 font-medium">...</th>
                      <th className="text-right p-2 font-medium">Dec</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="p-2">Pest Revenue</td>
                      <td className="text-right p-2 text-muted-foreground">125,000</td>
                      <td className="text-right p-2 text-muted-foreground">130,500</td>
                      <td className="text-right p-2 text-muted-foreground">142,000</td>
                      <td className="text-right p-2 text-muted-foreground">...</td>
                      <td className="text-right p-2 text-muted-foreground">155,000</td>
                    </tr>
                    <tr>
                      <td className="p-2">Termite Revenue</td>
                      <td className="text-right p-2 text-muted-foreground">45,000</td>
                      <td className="text-right p-2 text-muted-foreground">48,200</td>
                      <td className="text-right p-2 text-muted-foreground">52,100</td>
                      <td className="text-right p-2 text-muted-foreground">...</td>
                      <td className="text-right p-2 text-muted-foreground">58,000</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
