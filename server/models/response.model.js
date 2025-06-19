import mongoose from "mongoose"

const responseSchema = new mongoose.Schema({
  surveyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Survey",
    required: [true, "Survey ID is required"],
  },
  userId: {
    type: String,
    required: [true, "User ID is required"],
    trim: true,
  },
  department: {
    type: String,
    required: [true, "Department is required"],
    trim: true,
  },
  tenure: {
    type: String,
    required: [true, "Tenure is required"],
    trim: true,
  },
  answers: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    required: [true, "Answers are required"],
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  pdfGenerated: {
    type: Boolean,
    default: false,
  },
  pdfPath: {
    type: String,
    default: null,
  },
})

// This creates a non-unique index for better query performance
responseSchema.index({ surveyId: 1 })
responseSchema.index({ userId: 1 })
responseSchema.index({ department: 1 })

// Remove any existing unique compound index if it exists
// This will be executed when Mongoose connects to the database
responseSchema.pre("save", async function () {
  try {
    const indexes = await this.collection.getIndexes()
    const uniqueIndexName = "surveyId_1_department_1_tenure_1"

    if (indexes[uniqueIndexName]) {
      await this.collection.dropIndex(uniqueIndexName)
      console.log(`Dropped unique index: ${uniqueIndexName}`)
    }
  } catch (error) {
    console.error("Error handling indexes:", error)
    // Continue with save operation even if index drop fails
  }
})

export default mongoose.model("Response", responseSchema)
