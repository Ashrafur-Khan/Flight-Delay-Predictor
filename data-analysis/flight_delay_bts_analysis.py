# import libraries
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

from sklearn.model_selection import train_test_split

# load dataset
df = pd.read_csv("C:/Downloads/Airline_Delay_Cause (1).csv")
print("Dataset shape:", df.shape)
print(df.head())

# initial data inspection
print("\nDataset Info:")
print(df.info())

print("\nMissing Values:")
print(df.isnull().sum())

print("\nSummary Statistics:")
print(df.describe())

# remove carrier influence
df = df.drop(columns = [
    "carrier",
    "carrier_name",
    "carrier_delay",
    "carrier_ct"
], errors = "ignore")

# basic data cleaning
df = df[df["arr_flights"] > 0]

delay_cols = [
    "weather_delay",
    "nas_delay",
    "security_delay",
    "late_aircraft_delay"
]

df[delay_cols] = df[delay_cols].fillna(0)

# feature engineering
df["weather_delay_norm"] = df["weather_delay"] / df["arr_flights"]
df["nas_delay_norm"] = df["nas_delay"] / df["arr_flights"]
df["security_delay_norm"] = df["security_delay"] / df["arr_flights"]
df["late_aircraft_delay_norm"] = df["late_aircraft_delay"] / df["arr_flights"]

df["total_delay_norm"] = (
    df["weather_delay_norm"] +
    df["nas_delay_norm"] +
    df["security_delay_norm"] +
    df["late_aircraft_delay_norm"]
)

df["delay_rate"] = df["arr_del15"] / df["arr_flights"]

df["high_delay"] = (df["delay_rate"] > 0.2).astype(int)

# exploratory data analysis
monthly_delay = df.groupby("month")["delay_rate"].mean()

plt.figure(figsize = (8, 5))
monthly_delay.plot(marker = "o")
plt.title("Average Delay Rate by Month")
plt.xlabel("Month")
plt.ylabel("Delay Rate")
plt.show()

delay_causes = df[[
    "weather_delay_norm",
    "nas_delay_norm",
    "security_delay_norm",
    "late_aircraft_delay_norm"
]].mean()

plt.figure(figsize = (8, 5))
delay_causes.plot(kind = "bar")
plt.title("Average Normalized Delay Causes")
plt.ylabel("Delay Minutes Per Flight")
plt.show()

airport_delay = df.groupby("airport_name")["delay_rate"].mean()

top_airports = airport_delay.sort_values(ascending = False).head(10)

plt.figure(figsize = (10, 5))
top_airports.plot(kind = "barh")
plt.title("Top 10 Airports With Highest Delay Rates")
plt.xlabel("Delay Rate")
plt.show()

# prepare data for machine learning
model_df = df[[
    "month",
    "arr_flights",
    "weather_delay_norm",
    "nas_delay_norm",
    "security_delay_norm",
    "late_aircraft_delay_norm",
    "total_delay_norm",
    "high_delay"
]]

X = model_df.drop(columns = ["high_delay"])
y = model_df["high_delay"]

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size = 0.2,
    random_state = 42
)

print("\nTraining set size:", X_train.shape)
print("Test set size:", X_test.shape)

df.to_csv("cleaned_bts_flight_delay_data.csv", index = False)

print("\nCleaned dataset saved as 'cleaned_bts_flight_delay_data.csv'")